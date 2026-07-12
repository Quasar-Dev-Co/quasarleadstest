import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();
    if (!leadId) return NextResponse.json({ success: false, error: 'Lead ID required' }, { status: 400 });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.emailSequenceActive) return NextResponse.json({ success: false, error: 'Invalid lead' }, { status: 400 });

    const currentStage = lead.emailSequenceStage || 'called_once';
    const template = await prisma.emailTemplate.findFirst({ where: { stage: currentStage, isActive: true } });
    if (!template) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

    let nextScheduledEmail = new Date();
    if (template.timing) {
      const timing = template.timing as any;
      const delay = timing.delay || 0;
      const unit = timing.unit || 'minutes';
      if (unit === 'minutes') nextScheduledEmail.setMinutes(nextScheduledEmail.getMinutes() + delay);
      else if (unit === 'hours') nextScheduledEmail.setHours(nextScheduledEmail.getHours() + delay);
      else if (unit === 'days') nextScheduledEmail.setDate(nextScheduledEmail.getDate() + delay);
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: { nextScheduledEmail, emailStatus: 'ready' }
    });

    return NextResponse.json({ success: true, newSchedule: nextScheduledEmail });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}