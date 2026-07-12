import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

type SmtpProbeResult = {
  outcome: 'deliverable' | 'undeliverable' | 'inconclusive';
  code?: number;
  stage: string;
  reason: string;
};

type ValidationResult = {
  isValid: boolean;
  reason: string;
  syntax: boolean;
  domain: string;
  mx: boolean;
  mxHost?: string;
  smtp: SmtpProbeResult;
  source?: 'apify';
  apifyStatus?: string;
  apifySubResult?: string;
};

type ApifyConfig = {
  token: string;
  actorId: string;
};

function isSyntaxValid(email: string): boolean {
  const re = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
  return re.test((email || '').trim());
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
      const codeMatch = value.match(/\b(\d{3})\b/);
      if (codeMatch) {
        const code = Number(codeMatch[1]);
        if (Number.isFinite(code)) return code;
      }
    }
  }
  return undefined;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractFirstApifyRow(payload: any): any {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.items)) return payload.items[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (Array.isArray(payload?.results)) return payload.results[0] || null;
  if (payload && typeof payload === 'object') return payload;
  return null;
}

function classifyDeliverability(row: any): {
  smtpOutcome: 'deliverable' | 'undeliverable' | 'inconclusive';
  smtpCheck: boolean;
} {
  const primaryStatus = firstString(
    row?.result,
    row?.status,
    row?.verdict,
    row?.email_status,
    row?.smtp_status
  ).toLowerCase();

  const secondaryStatus = firstString(
    row?.sub_result,
    row?.subResult,
    row?.subresult,
    row?.reason,
    row?.message,
    row?.error
  ).toLowerCase();

  const statusText = `${primaryStatus} ${secondaryStatus}`.trim();

  const deliverableFlag = firstBoolean(
    row?.deliverable,
    row?.is_deliverable,
    row?.isDeliverable,
    row?.valid,
    row?.is_valid,
    row?.isValid,
    row?.can_receive_email,
    row?.canReceiveEmail,
    row?.result?.deliverable
  );

  const looksUndeliverable =
    statusText.includes('invalid') ||
    statusText.includes('undeliverable') ||
    statusText.includes('hard bounce') ||
    statusText.includes('mailbox_not_found') ||
    statusText.includes('no such user') ||
    statusText.includes('recipient rejected') ||
    statusText.includes('550') ||
    statusText.includes('551') ||
    statusText.includes('552') ||
    statusText.includes('553') ||
    statusText.includes('554');

  const looksInconclusive =
    statusText.includes('unknown') ||
    statusText.includes('inconclusive') ||
    statusText.includes('timeout') ||
    statusText.includes('greylist') ||
    statusText.includes('defer') ||
    statusText.includes('temporary');

  const looksDeliverable =
    statusText.includes('deliverable') ||
    statusText.includes('valid') ||
    statusText.includes('accepted') ||
    statusText.includes('ok');

  if (looksInconclusive) {
    return { smtpOutcome: 'inconclusive', smtpCheck: false };
  }

  if (deliverableFlag === true || (deliverableFlag === null && looksDeliverable && !looksUndeliverable)) {
    return { smtpOutcome: 'deliverable', smtpCheck: true };
  }

  if (deliverableFlag === false || looksUndeliverable) {
    return { smtpOutcome: 'undeliverable', smtpCheck: false };
  }

  return { smtpOutcome: 'inconclusive', smtpCheck: false };
}

async function resolveApifyConfig(userId: string): Promise<ApifyConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credentials: true },
  });

  const creds = ((user?.credentials as Record<string, any>) || {});
  const token = String(creds.APIFY_TOKEN || '').trim();
  const actorId = String(creds.APIFY_EMAIL_VERIFIER_ACTOR_ID || 'account56~email-verifier').trim();

  if (!token) {
    throw new Error('APIFY_TOKEN is missing in account credentials. Add it in Account Settings > Credentials.');
  }

  return { token, actorId };
}

async function verifyWithApify(email: string, apifyConfig: ApifyConfig): Promise<any> {
  const token = String(apifyConfig.token || '').trim();
  if (!token) {
    throw new Error('APIFY_TOKEN is missing in account credentials. Add it in Account Settings > Credentials.');
  }

  const actorId = String(apifyConfig.actorId || 'account56~email-verifier').trim();
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ emails: [email] }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      firstString(payload?.error?.message, payload?.message, payload?.error) ||
      `Apify request failed (${response.status})`;
    throw new Error(message);
  }

  const row = extractFirstApifyRow(payload);
  if (!row) {
    throw new Error('Apify returned no verification result for this email');
  }

  return row;
}

async function validateEmail(email: string, apifyConfig: ApifyConfig): Promise<ValidationResult> {
  const trimmed = (email || '').trim().toLowerCase();
  const domain = trimmed.split('@')[1]?.toLowerCase() || '';
  if (!isSyntaxValid(trimmed) || !domain) {
    return {
      isValid: false,
      reason: 'invalid_syntax',
      syntax: false,
      domain,
      mx: false,
      smtp: { outcome: 'undeliverable', stage: 'precheck', reason: 'invalid_format' },
      source: 'apify',
    };
  }

  try {
    const row = await verifyWithApify(trimmed, apifyConfig);
    const domainExists =
      firstBoolean(row?.domain_exists, row?.domainExists, row?.is_domain_valid, row?.isDomainValid) ?? true;

    const mxFound =
      firstBoolean(row?.mx_found, row?.mxFound, row?.has_mx, row?.hasMx, row?.mx_valid, row?.mxValid) ??
      domainExists;

    const { smtpOutcome, smtpCheck } = classifyDeliverability(row);
    const smtpCode = firstNumber(
      row?.smtp_code,
      row?.smtpCode,
      row?.code,
      row?.response_code,
      row?.responseCode,
      row?.status,
      row?.reason
    );

    const mxHostsRaw = row?.mx_hosts || row?.mxHosts || row?.mx || row?.mx_records || row?.mxRecords;
    const mxHosts = Array.isArray(mxHostsRaw)
      ? mxHostsRaw.map((item: any) => String(item?.exchange || item || '').trim()).filter(Boolean)
      : [];

    const mxHost = firstString(row?.mx_host, row?.mxHost, mxHosts[0]);

    const smtp: SmtpProbeResult = {
      outcome: smtpOutcome,
      code: smtpCode,
      stage: firstString(row?.stage, row?.smtp_stage, row?.smtpStage) || 'apify',
      reason:
        firstString(
          row?.sub_result,
          row?.subResult,
          row?.subresult,
          row?.reason,
          row?.status,
          row?.result,
          row?.verdict,
          row?.message
        ) || 'verified_by_apify',
    };

    const isValid = Boolean(isSyntaxValid(trimmed) && domainExists && mxFound && smtpCheck);
    const reason = !domainExists
      ? 'domain_not_found'
      : !mxFound
        ? 'no_mx_record'
        : smtpOutcome === 'deliverable'
          ? 'smtp_accept'
          : smtpOutcome === 'undeliverable'
            ? 'smtp_hard_reject'
            : 'smtp_inconclusive';

    return {
      isValid,
      reason,
      syntax: true,
      domain,
      mx: Boolean(mxFound),
      mxHost: mxHost || undefined,
      smtp,
      source: 'apify',
      apifyStatus: firstString(row?.result, row?.status, row?.verdict) || undefined,
      apifySubResult: firstString(row?.sub_result, row?.subResult, row?.subresult) || undefined,
    };
  } catch (error: any) {
    return {
      isValid: false,
      reason: 'apify_validation_error',
      syntax: true,
      domain,
      mx: false,
      smtp: {
        outcome: 'inconclusive',
        stage: 'apify',
        reason: firstString(error?.message) || 'apify_validation_error',
      },
      source: 'apify',
    };
  }
}

export async function GET(request: NextRequest) {
  const BATCH_SIZE = 20;
  try {
    const leads = await prisma.lead.findMany({
      where: { emailValidationStatus: 'notScanned', status: 'active' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE
    });

    if (leads.length === 0) return NextResponse.json({ success: true, message: 'Done' });

    const apifyConfigByUserId = new Map<string, ApifyConfig>();

    for (const lead of leads) {
      await prisma.lead.update({ where: { id: lead.id }, data: { emailValidationStatus: 'checking' } });

      const ownerUserId = String(lead.leadsCreatedBy || lead.assignedTo || '').trim();
      if (!ownerUserId) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            emailValidationStatus: 'invalid',
            emailValidationCheckedAt: new Date(),
            emailValidationDetails: {
              isValid: false,
              reason: 'apify_credentials_missing_owner',
              source: 'apify',
              smtp: { outcome: 'inconclusive', stage: 'apify', reason: 'missing_lead_owner' }
            } as any,
          },
        });
        continue;
      }

      try {
        let apifyConfig = apifyConfigByUserId.get(ownerUserId);
        if (!apifyConfig) {
          apifyConfig = await resolveApifyConfig(ownerUserId);
          apifyConfigByUserId.set(ownerUserId, apifyConfig);
        }

        const val = await validateEmail(lead.email, apifyConfig);
        console.log(`📧 Email validation for ${lead.email}: ${val.isValid ? 'valid' : 'invalid'} (${val.reason})`);
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            emailValidationStatus: val.isValid ? 'valid' : 'invalid',
            emailValidationCheckedAt: new Date(),
            emailValidationDetails: val as any
          }
        });
      } catch (error: any) {
        const reason = firstString(error?.message) || 'apify_credentials_error';
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            emailValidationStatus: 'invalid',
            emailValidationCheckedAt: new Date(),
            emailValidationDetails: {
              isValid: false,
              reason: 'apify_credentials_error',
              source: 'apify',
              smtp: { outcome: 'inconclusive', stage: 'apify', reason }
            } as any,
          },
        });
      }
    }

    return NextResponse.json({ success: true, processed: leads.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
