import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

async function getEmailTimingSettings() {
  try {
    const settings = await prisma.companySettings.findFirst({ where: { type: 'default' } });
    if (settings?.emailTimings) return (settings.emailTimings as any[]);
    return [
      { stage: 'called_once', delay: 0, unit: 'minutes' },
      { stage: 'called_twice', delay: 5, unit: 'minutes' },
      { stage: 'called_three_times', delay: 5, unit: 'minutes' },
      { stage: 'called_four_times', delay: 5, unit: 'minutes' },
      { stage: 'called_five_times', delay: 5, unit: 'minutes' },
      { stage: 'called_six_times', delay: 5, unit: 'minutes' },
      { stage: 'called_seven_times', delay: 5, unit: 'minutes' }
    ];
  } catch (error) {
    return [];
  }
}

function calculateEmailDate(timingSettings: any[], stage: string, baseTime: Date): Date {
  const timing = timingSettings.find(t => t.stage === stage);
  const emailDate = new Date(baseTime);
  if (!timing) { emailDate.setMinutes(emailDate.getMinutes() + 5); return emailDate; }

  if (timing.unit === 'minutes') emailDate.setMinutes(emailDate.getMinutes() + timing.delay);
  else if (timing.unit === 'hours') emailDate.setHours(emailDate.getHours() + timing.delay);
  else if (timing.unit === 'days') emailDate.setDate(emailDate.getDate() + timing.delay);
  else emailDate.setMinutes(emailDate.getMinutes() + (timing.delay || 5));

  return emailDate;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { leadId, startStage } = await request.json();
    if (!leadId || !startStage) return NextResponse.json({ success: false, error: 'Lead ID and stage required' }, { status: 400 });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });

    const existingJob = await prisma.jobQueue.findFirst({ where: { leadId, type: 'email-sequence', status: { in: ['pending', 'running'] } } });
    if (existingJob) return NextResponse.json({ success: false, error: 'Job already active' }, { status: 400 });

    const timingSettings = await getEmailTimingSettings();
    const stages = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];

    const emailSchedule = [];
    const startTime = new Date();
    const firstEmailTime = new Date(startTime.getTime() + 10 * 1000);
    emailSchedule.push({ step: 1, stage: stages[0], scheduledAt: firstEmailTime, status: 'pending' });

    let lastEmailTime = firstEmailTime;
    for (let i = 1; i < 7; i++) {
      const emailTime = calculateEmailDate(timingSettings, stages[i], lastEmailTime);
      emailSchedule.push({ step: i + 1, stage: stages[i], scheduledAt: emailTime, status: 'pending' });
      lastEmailTime = emailTime;
    }

    const job = await prisma.jobQueue.create({
      data: {
        jobId: uuidv4(),
        type: 'email-sequence',
        status: 'pending',
        priority: 10,
        leadQuantity: 0,
        totalSteps: 7,
        progressMessage: `Email sequence queued for \${lead.name}`,
        leadId,
        emailSchedule: emailSchedule as any,
        nextEmailDue: firstEmailTime
      }
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        emailAutomationEnabled: true,
        emailSequenceActive: true,
        emailSequenceStage: startStage,
        emailSequenceStartDate: new Date(),
        emailSequenceStep: 1,
        nextScheduledEmail: firstEmailTime
      }
    });

    return NextResponse.json({ success: true, jobId: job.jobId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}