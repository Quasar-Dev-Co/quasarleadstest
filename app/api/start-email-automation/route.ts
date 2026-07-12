import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { leadIds, userId, outreachRecipient, senderIdentity } = await request.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'Lead IDs are required' }, { status: 400 });
    }

    const normalizedLeadIds = Array.from(
      new Set(leadIds.map((id: any) => String(id || '').trim()).filter(Boolean))
    );

    if (normalizedLeadIds.length === 0) {
      return NextResponse.json({ error: 'No valid lead IDs provided' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });

    const creds = (user?.credentials as any) || {};
    const hasLegacySmtp = creds.SMTP_HOST && creds.SMTP_PORT && creds.SMTP_USER && creds.SMTP_PASSWORD;
    const hasSmtpAccounts = Array.isArray(creds.SMTP_ACCOUNTS) && creds.SMTP_ACCOUNTS.some(
      (a: any) => a?.SMTP_HOST && a?.SMTP_PORT && a?.SMTP_USER && a?.SMTP_PASSWORD
    );
    if (!hasLegacySmtp && !hasSmtpAccounts) {
      return NextResponse.json({ error: 'Missing SMTP credentials. Configure at least one SMTP account in Account Settings.', missingCredentials: true }, { status: 400 });
    }

    const allStages = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];
    const availableStages: string[] = [];

    for (const stage of allStages) {
      const found = await prisma.emailTemplate.findFirst({
        where: {
          stage,
          isActive: true,
          OR: [
            { userId: userId },
            { userId: null },
            { userId: '' }
          ]
        }
      });
      if (found) availableStages.push(stage);
    }

    if (availableStages.length === 0) {
      return NextResponse.json({ error: 'No email templates found. Please add at least one email template in Email Prompting before starting automation.', missingTemplates: allStages }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({
      where: {
        id: { in: normalizedLeadIds },
        OR: [{ leadsCreatedBy: userId }, { assignedTo: userId }],
        email: { not: '' }
      }
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No valid leads found with email addresses' }, { status: 404 });
    }

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const results: Array<{ leadId: string; status: 'started' | 'skipped' | 'error'; message?: string }> = [];

    for (const lead of leads) {
      try {
        if (lead.emailSequenceActive) {
          results.push({ leadId: lead.id, status: 'skipped', message: 'Already active' });
          skippedCount++;
          continue;
        }

        const now = new Date();
        const firstEmailTime = new Date(now.getTime() + 2 * 60 * 1000);

        const updateData: any = {
          emailSequenceActive: true,
          emailAutomationEnabled: true,
          emailSequenceStage: 'not_called',
          emailSequenceStep: 0,
          emailSequenceStartDate: now,
          nextScheduledEmail: firstEmailTime,
          emailStatus: 'ready',
          emailRetryCount: 0,
          emailFailureCount: 0,
          assignedTo: userId,
          leadsCreatedBy: userId,
          updatedAt: now
        };

        if (senderIdentity) updateData.senderIdentity = senderIdentity;
        if (outreachRecipient) updateData.outreachRecipient = outreachRecipient;

        await prisma.lead.update({
          where: { id: lead.id },
          data: updateData
        });

        successCount++;
        results.push({ leadId: lead.id, status: 'started' });
      } catch (err: any) {
        errorCount++;
        results.push({ leadId: lead.id, status: 'error', message: err?.message || 'Failed to start automation' });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Email automation started for ${successCount} leads`,
      summary: {
        totalRequested: normalizedLeadIds.length,
        matched: leads.length,
        started: successCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      results,
    });

  } catch (error: any) {
    console.error('Failed to start email automation:', error);
    return NextResponse.json({ error: 'Failed to start email automation', details: error.message }, { status: 500 });
  }
}