import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';

const EMAIL_STAGES = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];

export async function POST(request: NextRequest) {
  try {
    const { leadId, forceToStage } = await request.json();
    if (!leadId) return NextResponse.json({ success: false, error: 'Lead ID required' }, { status: 400 });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    let nextStage: string;
    if (forceToStage) {
      if (!EMAIL_STAGES.includes(forceToStage)) return NextResponse.json({ success: false, error: 'Invalid stage' }, { status: 400 });
      nextStage = forceToStage;
    } else {
      const idx = EMAIL_STAGES.indexOf(lead.emailSequenceStage || 'called_once');
      if (idx === -1 || idx >= EMAIL_STAGES.length - 1) return NextResponse.json({ success: false, error: 'Final stage' }, { status: 400 });
      nextStage = EMAIL_STAGES[idx + 1];
    }

    const userId = lead.leadsCreatedBy || lead.assignedTo;
    const template = await prisma.emailTemplate.findFirst({
      where: { stage: nextStage, isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: { userId: 'desc' } // Prefer user-specific
    });
    const companySettings = await prisma.companySettings.findFirst({
      where: { OR: [{ userId }, { type: 'default' }] },
      orderBy: { userId: 'desc' }
    });

    if (!template || !companySettings) return NextResponse.json({ success: false, error: 'Template or settings missing' }, { status: 404 });

    const subject = template.subject.replace(/{{NAME}}/g, lead.name);
    const html = template.htmlContent.replace(/{{NAME}}/g, lead.name);

    // SMTP Logic Simplified
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail.zxcs.nl',
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });

    const result = await transporter.sendMail({
      from: companySettings.senderEmail,
      to: lead.email,
      subject,
      html
    });

    const isLast = nextStage === 'called_seven_times';
    const emailHistory = (lead.emailHistory as any[]) || [];

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        emailSequenceStage: nextStage,
        emailSequenceStep: EMAIL_STAGES.indexOf(nextStage) + 1,
        emailSequenceActive: !isLast,
        emailHistory: [...emailHistory, { stage: nextStage, sentAt: new Date(), status: 'sent', messageId: result.messageId }]
      }
    });

    return NextResponse.json({ success: true, nextStage, messageId: result.messageId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}