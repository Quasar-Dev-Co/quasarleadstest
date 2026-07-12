import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

/**
 * Tests SMTP connection and sends a test email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPassword, saveCredentials, testRecipient, userId } = body;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      return NextResponse.json({
        success: false,
        error: 'Missing required SMTP credentials'
      }, { status: 400 });
    }

    // Validate effective user ID
    const effectiveUserId = userId || request.headers.get('x-user-id');
    let user = null;

    if (effectiveUserId) {
      user = await prisma.user.findUnique({
        where: { id: effectiveUserId }
      });
    }

    const portNumber = parseInt(smtpPort, 10);
    const secure = portNumber === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNumber,
      secure,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      connectionTimeout: 30000
    });

    await transporter.verify();

    const recipient = testRecipient || (user?.email) || smtpUser;
    const mailOptions = {
      from: `"QuasarLeads Test" <${smtpUser}>`,
      to: recipient,
      subject: 'SMTP Test Email - QuasarLeads',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; }
            .header { background: #6d28d9; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>SMTP Test Successful</h1></div>
            <p>Your SMTP settings are working correctly! 🎉</p>
            <ul>
              <li><strong>Host:</strong> ${smtpHost}</li>
              <li><strong>Port:</strong> ${portNumber}</li>
              <li><strong>User:</strong> ${smtpUser}</li>
            </ul>
            <p>Sent at: ${new Date().toLocaleString()}</p>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    if (saveCredentials && effectiveUserId) {
      const credentials = (user?.credentials as any) || {};
      await prisma.user.update({
        where: { id: effectiveUserId },
        data: {
          credentials: {
            ...credentials,
            SMTP_HOST: smtpHost,
            SMTP_PORT: smtpPort.toString(),
            SMTP_USER: smtpUser,
            SMTP_PASSWORD: smtpPassword
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'SMTP connection successful! Test email sent.',
      data: { messageId: info.messageId, recipient }
    });

  } catch (error: any) {
    console.error('SMTP Test Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'SMTP test failed' }, { status: 500 });
  }
}