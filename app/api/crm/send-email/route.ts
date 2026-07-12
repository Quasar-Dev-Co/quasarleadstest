import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/emailService';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, stage, manual = false, userId, recipientOption } = body;

    if (!leadId || !stage) {
      return NextResponse.json({ success: false, error: 'Lead ID and stage are required' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.email || !lead.name || !lead.company) {
      return NextResponse.json({ success: false, error: 'Lead missing email data' }, { status: 400 });
    }

    const targetEmail = recipientOption === 'company' && (lead.authInformation as any)?.company_email
      ? (lead.authInformation as any).company_email
      : lead.email;

    const emailResult = await emailService.sendStageEmail({
      name: lead.name,
      email: targetEmail,
      company: lead.company,
      stage: stage,
      leadId: leadId,
      searchService: (lead as any).searchService || '',
      searchLocation: (lead as any).searchLocation || ''
    }, userId);

    if (emailResult.success) {
      const emailHistory = (lead.emailHistory as any[]) || [];
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          emailHistory: [
            ...emailHistory,
            { stage, sentAt: new Date(), messageId: emailResult.messageId, status: 'sent', manual, trackingId: emailResult.trackingId }
          ] as any,
          lastEmailedAt: new Date(),
          updatedAt: new Date()
        }
      });

      return NextResponse.json({ success: true, messageId: emailResult.messageId });
    } else {
      return NextResponse.json({ success: false, error: emailResult.error }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const connectionTest = await emailService.testConnection();
    return NextResponse.json({ success: connectionTest.success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}