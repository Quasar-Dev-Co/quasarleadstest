import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';

export async function POST(request: NextRequest) {
  try {
    const { template, testEmail, testLead, companySettings, userId } = await request.json();
    if (!userId || !template || !testEmail) return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const creds = (user?.credentials as any) || {};
    if (!creds.SMTP_HOST || !creds.SMTP_USER || !creds.SMTP_PASSWORD) return NextResponse.json({ success: false, error: 'SMTP not configured' }, { status: 400 });

    const variables = {
      '{{LEAD_NAME}}': testLead.name || 'Test Lead',
      '{{COMPANY_NAME}}': testLead.company || 'Test Company',
      '{{SENDER_NAME}}': companySettings.senderName || 'QuasarLeads Team'
    };

    let processedHtml = template.htmlContent || '';
    Object.entries(variables).forEach(([key, value]) => {
      processedHtml = processedHtml.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    const result = await emailService.sendEmailForUser(userId, {
      to: testEmail,
      subject: `[TEST] \${template.subject}`,
      html: processedHtml,
      text: processedHtml.replace(/<[^>]*>/g, ''),
      leadId: 'test-lead',
      stage: template.stage || 'test'
    });

    return NextResponse.json({ success: result.success, messageId: result.messageId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}