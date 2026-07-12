import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';
import { createEmailTracking, injectTrackingPixel } from '@/lib/email-tracking';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { responseId, customSubject, customContent } = body;
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!responseId) return NextResponse.json({ success: false, error: 'AI Response ID is required' }, { status: 400 });

    const aiResponse = await prisma.aIResponse.findUnique({
      where: { id: responseId },
      include: { incomingEmail: true }
    });

    if (!aiResponse) return NextResponse.json({ success: false, error: 'AI response not found' }, { status: 404 });
    if (aiResponse.status === 'sent') return NextResponse.json({ success: false, error: 'Already sent' }, { status: 400 });

    const originalEmail = aiResponse.incomingEmail;
    if (!originalEmail) return NextResponse.json({ success: false, error: 'Original email not found' }, { status: 404 });

    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const creds = (user?.credentials as any) || {};
    const hasLegacySmtp = creds.SMTP_HOST && creds.SMTP_PORT && creds.SMTP_USER && creds.SMTP_PASSWORD;
    const hasSmtpAccounts = Array.isArray(creds.SMTP_ACCOUNTS) && creds.SMTP_ACCOUNTS.some(
      (a: any) => a?.SMTP_HOST && a?.SMTP_PORT && a?.SMTP_USER && a?.SMTP_PASSWORD
    );
    if (!hasLegacySmtp && !hasSmtpAccounts) {
      return NextResponse.json({ success: false, error: 'Missing SMTP credentials. Configure at least one SMTP account in Account Settings.' }, { status: 400 });
    }

    // Create tracking record and inject pixel for AI response emails
    const leadId = originalEmail.leadId || '';
    const htmlContent = `<div style="font-family: Arial, sans-serif;">${(customContent || aiResponse.generatedContent).replace(/\n/g, '<br>')}</div>`;
    let trackingId = '';
    let finalHtml = htmlContent;
    if (leadId) {
      trackingId = await createEmailTracking({
        leadId,
        userId,
        stage: 'ai_response',
        recipientEmail: originalEmail.leadEmail,
        subject: customSubject || aiResponse.generatedSubject,
      });
      if (trackingId) {
        finalHtml = injectTrackingPixel(htmlContent, trackingId);
      }
    }

    const emailConfig = {
      to: originalEmail.leadEmail,
      subject: customSubject || aiResponse.generatedSubject,
      text: customContent || aiResponse.generatedContent,
      html: finalHtml,
    };

    const result = await emailService.sendEmailForUser(userId, emailConfig);

    if (result.success) {
      await prisma.aIResponse.update({
        where: { id: responseId },
        data: { status: 'sent', sentAt: new Date(), sentMessageId: result.messageId }
      });
      await prisma.incomingEmail.update({
        where: { id: originalEmail.id },
        data: { status: 'responded', respondedAt: new Date() }
      });
      return NextResponse.json({ success: true, messageId: result.messageId });
    } else {
      await prisma.aIResponse.update({
        where: { id: responseId },
        data: { status: 'failed', lastError: result.error }
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}