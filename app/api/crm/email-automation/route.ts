import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, action, stage, userId } = body;

    if (!leadId || !action) {
      return NextResponse.json({ success: false, error: 'Lead ID and action are required' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    if (action === 'start') {
      if (!stage) {
        return NextResponse.json({ success: false, error: 'Stage is required to start automation' }, { status: 400 });
      }

      const settings = await prisma.companySettings.findFirst({
        where: { OR: [{ userId: userId }, { type: 'default' }] }
      });

      let firstEmailDate = new Date(Date.now() + 10000); // 10s default

      const timings = (settings?.emailTimings as any[]) || [];
      const timing = timings.find((t: any) => t.stage === stage);
      if (timing) {
        const delayMs = timing.unit === 'minutes' ? timing.delay * 60 * 1000 :
          timing.unit === 'hours' ? timing.delay * 60 * 60 * 1000 :
            timing.unit === 'days' ? timing.delay * 24 * 60 * 60 * 1000 :
              timing.delay * 60 * 1000;
        firstEmailDate = new Date(Date.now() + Math.max(delayMs, 10000));
      }

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          emailAutomationEnabled: true,
          emailSequenceActive: true,
          emailSequenceStage: stage,
          emailSequenceStartDate: new Date(),
          emailSequenceStep: 1,
          nextScheduledEmail: firstEmailDate,
          emailStoppedReason: null,
          updatedAt: new Date()
        }
      });

      return NextResponse.json({ success: true, message: 'Started', nextEmailAt: firstEmailDate });

    } else if (action === 'stop') {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          emailSequenceActive: false,
          emailStoppedReason: body.reason || 'Manual stop',
          nextScheduledEmail: null,
          updatedAt: new Date()
        }
      });
      return NextResponse.json({ success: true, message: 'Stopped' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, emailAutomationEnabled } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'Lead ID is required' }, { status: 400 });
    }

    const updateData: any = { updatedAt: new Date() };
    if (emailAutomationEnabled !== undefined) {
      updateData.emailAutomationEnabled = emailAutomationEnabled;
      if (!emailAutomationEnabled) {
        updateData.emailSequenceActive = false;
        updateData.nextScheduledEmail = null;
      }
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData
    });

    return NextResponse.json({ success: true, lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}