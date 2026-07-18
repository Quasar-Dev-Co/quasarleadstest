import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('📧 EMAIL SEQUENCE PROCESSOR STARTING');
    const now = new Date();

    const dueJobs = await prisma.jobQueue.findMany({
      where: {
        type: 'email-sequence',
        status: { in: ['pending', 'running'] },
        nextEmailDue: { lte: now }
      },
      include: { user: true }
    });

    if (dueJobs.length === 0) {
      return NextResponse.json({ success: true, message: "No email sequences due" });
    }

    let emailsSent = 0;
    const results = [];

    for (const job of dueJobs) {
      if (!job.leadId) continue;

      try {
        const lead = await prisma.lead.findUnique({ where: { id: job.leadId } });
        if (!lead) {
          await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: 'Lead not found' } });
          continue;
        }

        const schedule = (job.emailSchedule as any[]) || [];
        const nextEmail = schedule.find((e: any) => e.status === 'pending' && new Date(e.scheduledAt) <= now);

        if (!nextEmail) continue;

        const authInfo = (lead.authInformation as any) || {};
        const emailResult = await emailService.sendStageEmail({
          name: lead.name,
          email: lead.email,
          company: lead.company || 'Your Company',
          stage: nextEmail.stage,
          leadId: lead.id,
          searchService: (lead as any).searchService || '',
          searchLocation: (lead as any).searchLocation || '',
          interestKeywords: authInfo.interest_keywords || '',
          linkedinProfile: (lead as any).linkedinProfile || '',
          companyLinkedin: authInfo.company_linkedin || ''
        }, job.userId || '');

        if (emailResult.success) {
          const updatedSchedule = schedule.map((e: any) =>
            e.step === nextEmail.step ? { ...e, status: 'sent', sentAt: new Date(), messageId: emailResult.messageId } : e
          );

          const sentCount = updatedSchedule.filter((e: any) => e.status === 'sent').length;
          const nextPending = updatedSchedule.find((e: any) => e.status === 'pending');

          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              emailHistory: [
                ...((lead.emailHistory as any[]) || []),
                { stage: nextEmail.stage, sentAt: new Date(), messageId: emailResult.messageId, status: 'sent', manual: false, trackingId: emailResult.trackingId }
              ] as any,
              emailSequenceStep: nextEmail.step,
              emailSequenceStage: nextEmail.stage,
              lastEmailedAt: new Date()
            }
          });

          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              emailSchedule: updatedSchedule as any,
              progress: Math.round((sentCount / 7) * 100),
              currentStep: nextEmail.step,
              nextEmailDue: nextPending ? new Date(nextPending.scheduledAt) : null,
              status: nextPending ? 'running' : 'completed',
              completedAt: nextPending ? null : new Date()
            }
          });

          if (!nextPending) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { emailSequenceActive: false, emailStoppedReason: 'Sequence completed' }
            });
          }

          emailsSent++;
          results.push({ jobId: job.jobId, status: 'sent' });
        } else {
          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              nextEmailDue: new Date(Date.now() + 10 * 60 * 1000),
              retryCount: { increment: 1 },
              status: (job.retryCount || 0) + 1 >= (job.maxRetries || 3) ? 'failed' : 'running',
              errorMessage: emailResult.error
            }
          });
          results.push({ jobId: job.jobId, status: 'failed', error: emailResult.error });
        }
      } catch (err: any) {
        await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: err.message } });
      }
    }

    return NextResponse.json({ success: true, emailsSent, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}