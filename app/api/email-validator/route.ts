import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns';
import net from 'net';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const resolveMx = dns.promises.resolveMx;
const resolve4 = dns.promises.resolve4;
const resolve6 = dns.promises.resolve6;
const resolveNs = dns.promises.resolveNs;

const ROLE_PREFIXES = new Set([
  'admin',
  'support',
  'info',
  'sales',
  'contact',
  'hello',
  'team',
  'marketing',
  'hr',
  'careers',
  'office',
  'billing',
  'noreply',
  'no-reply',
]);

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'sharklasers.com',
  'dispostable.com',
  'trashmail.com',
  'maildrop.cc',
  'fakeinbox.com',
  'throwawaymail.com',
  'mintemail.com',
  'mytrashmail.com',
  'getairmail.com',
  'mailnesia.com',
  'tempinbox.com',
  'fakemail.net',
  'guerrillamailblock.com',
  'spambog.com',
]);

const HARD_INVALID_SMTP_CODES = new Set([550, 551, 552, 553, 554]);

type SmtpProbeResult = {
  outcome: 'deliverable' | 'undeliverable' | 'inconclusive';
  code?: number;
  stage: string;
  reason: string;
  host?: string;
};

type ApifyConfig = {
  token: string;
  actorId: string;
};

function isValidFormat(email: string): boolean {
  const re = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
  return re.test((email || '').trim());
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
    }),
  ]);
}

async function verifyRcptSmtp(email: string, mxHost: string): Promise<SmtpProbeResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 12000;
    let settled = false;
    let stage: 'connect' | 'greeting' | 'ehlo' | 'mail_from' | 'rcpt_to' | 'done' = 'connect';
    let buffer = '';

    const finish = (result: SmtpProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...result, host: mxHost });
    };

    const sendCommand = (cmd: string) => socket.write(cmd + '\r\n');

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      finish({ outcome: 'inconclusive', stage, reason: 'smtp_timeout' });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        outcome: 'inconclusive',
        stage,
        reason: `smtp_error:${err.code || 'unknown'}`,
      });
    });

    socket.on('data', (data) => {
      if (settled) return;
      buffer += data.toString();

      while (buffer.includes('\n')) {
        const newlineIndex = buffer.indexOf('\n');
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        const match = line.match(/^(\d{3})([\s-])/);
        if (!match) continue;

        const code = Number(match[1]);
        const separator = match[2];

        if (separator === '-') continue;

        switch (stage) {
          case 'connect':
          case 'greeting':
            if (code === 220) {
              sendCommand('EHLO validator.local');
              stage = 'ehlo';
            } else {
              finish({ outcome: 'inconclusive', code, stage, reason: `unexpected_greeting_${code}` });
            }
            break;

          case 'ehlo':
            if (code === 250) {
              sendCommand('MAIL FROM:<verify@validator.local>');
              stage = 'mail_from';
            } else {
              finish({ outcome: 'inconclusive', code, stage, reason: `ehlo_rejected_${code}` });
            }
            break;

          case 'mail_from':
            if (code === 250) {
              sendCommand(`RCPT TO:<${email}>`);
              stage = 'rcpt_to';
            } else {
              finish({ outcome: 'inconclusive', code, stage, reason: `mail_from_rejected_${code}` });
            }
            break;

          case 'rcpt_to':
            sendCommand('QUIT');
            stage = 'done';

            if (code === 250) {
              finish({ outcome: 'deliverable', code, stage: 'rcpt_to', reason: 'rcpt_accepted' });
            } else if (HARD_INVALID_SMTP_CODES.has(code)) {
              finish({ outcome: 'undeliverable', code, stage: 'rcpt_to', reason: `rcpt_rejected_${code}` });
            } else {
              finish({ outcome: 'inconclusive', code, stage: 'rcpt_to', reason: `rcpt_uncertain_${code}` });
            }
            break;

          default:
            break;
        }
      }
    });

    stage = 'greeting';
    socket.connect(25, mxHost);
  });
}

async function probeAcrossMxHosts(email: string, mxHosts: string[]): Promise<SmtpProbeResult> {
  let lastInconclusive: SmtpProbeResult = {
    outcome: 'inconclusive',
    stage: 'connect',
    reason: 'no_probe_attempt',
  };

  for (const host of mxHosts.slice(0, 3)) {
    try {
      const result = await verifyRcptSmtp(email, host);
      if (result.outcome === 'deliverable' || result.outcome === 'undeliverable') {
        return result;
      }
      lastInconclusive = result;
    } catch {
      lastInconclusive = {
        outcome: 'inconclusive',
        stage: 'connect',
        reason: 'probe_exception',
        host,
      };
    }
  }

  return lastInconclusive;
}

function computeScore(params: {
  validFormat: boolean;
  domainExists: boolean;
  mxFound: boolean;
  smtpCheck: boolean;
}): number {
  const checks = [
    params.validFormat,
    params.domainExists,
    params.mxFound,
    params.smtpCheck,
  ];

  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
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
    const message = firstString(payload?.error?.message, payload?.message, payload?.error) || `Apify request failed (${response.status})`;
    throw new Error(message);
  }

  const row = extractFirstApifyRow(payload);
  if (!row) {
    throw new Error('Apify returned no verification result for this email');
  }

  return row;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!userId) {
      return NextResponse.json({ success: false, error: 'AUTH_REQUIRED' }, { status: 401 });
    }

    const apifyConfig = await resolveApifyConfig(userId);

    const body = await request.json();
    const rawEmail = String(body?.email || '').trim();
    const email = rawEmail.toLowerCase();

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const validFormat = isValidFormat(email);
    const localPart = validFormat ? email.split('@')[0] : '';
    const domain = validFormat ? email.split('@')[1] : '';

    if (!validFormat || !domain) {
      return NextResponse.json({
        success: true,
        email,
        validFormat: false,
        domainExists: false,
        mxFound: false,
        disposable: false,
        role: false,
        disposablePass: true,
        rolePass: true,
        deliverable: false,
        score: 0,
        smtpCheck: false,
        catchAll: false,
        catchAllPass: true,
        mailboxExistsProbable: false,
        details: {
          domain,
          mxHosts: [],
          smtp: {
            outcome: 'undeliverable',
            stage: 'precheck',
            reason: 'invalid_format',
          },
          note: 'Validation is powered by Apify Million Verifier. Invalid format is blocked before external verification.',
        },
      });
    }

    const row = await verifyWithApify(email, apifyConfig);

    const role = firstBoolean(row?.role, row?.is_role, row?.isRole) ?? ROLE_PREFIXES.has(localPart.toLowerCase());
    const disposable =
      firstBoolean(row?.disposable, row?.is_disposable, row?.isDisposable) ??
      DISPOSABLE_DOMAINS.has(domain.toLowerCase());
    const rolePass = !role;
    const disposablePass = !disposable;

    const domainExists =
      firstBoolean(row?.domain_exists, row?.domainExists, row?.is_domain_valid, row?.isDomainValid) ??
      true;

    const mxFound =
      firstBoolean(row?.mx_found, row?.mxFound, row?.has_mx, row?.hasMx, row?.mx_valid, row?.mxValid) ??
      domainExists;

    const mxHostsRaw = row?.mx_hosts || row?.mxHosts || row?.mx || row?.mx_records || row?.mxRecords;
    const mxHosts = Array.isArray(mxHostsRaw)
      ? mxHostsRaw.map((item: any) => String(item?.exchange || item || '').trim()).filter(Boolean)
      : [];

    const { smtpOutcome, smtpCheck } = classifyDeliverability(row);

    const catchAllDetected =
      firstBoolean(row?.catch_all, row?.catchAll, row?.accept_all, row?.acceptAll) ??
      String(row?.status || row?.result || '').toLowerCase().includes('catch');
    const catchAllPass = !catchAllDetected;
    const mailboxExistsProbable = smtpOutcome !== 'undeliverable' && !catchAllDetected;

    const smtpCode = firstNumber(
      row?.smtp_code,
      row?.smtpCode,
      row?.code,
      row?.response_code,
      row?.responseCode,
      row?.status,
      row?.reason
    );

    const smtp: SmtpProbeResult = {
      outcome: smtpOutcome,
      code: smtpCode,
      stage: firstString(row?.stage, row?.smtp_stage, row?.smtpStage) || 'apify',
      reason:
        firstString(row?.reason, row?.status, row?.result, row?.verdict, row?.message) ||
        'verified_by_apify',
      host: firstString(row?.mx_host, row?.mxHost),
    };

    const score = computeScore({
      validFormat,
      domainExists,
      mxFound,
      smtpCheck,
    });

    const deliverable =
      validFormat &&
      domainExists &&
      mxFound &&
      smtpCheck;

    return NextResponse.json({
      success: true,
      email,
      validFormat,
      domainExists,
      mxFound,
      disposable,
      role,
      disposablePass,
      rolePass,
      deliverable,
      score,
      smtpCheck,
      catchAll: catchAllDetected,
      catchAllPass,
      mailboxExistsProbable,
      details: {
        domain,
        mxHosts: mxHosts.slice(0, 3),
        smtp,
        note:
          'Deliverable status is based on 4 checks only: format, domain, MX, and SMTP. SMTP verification source: Apify Email Verifier (Million Verifier).',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to validate email' },
      { status: 500 }
    );
  }
}
