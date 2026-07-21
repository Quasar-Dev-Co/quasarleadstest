import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { selectSmtpAccountWithEnvFallback } from '@/lib/smtp-rotation';

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST - Resend verification code to user's email
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email address' },
        { status: 404 }
      );
    }

    if (user.verified) {
      return NextResponse.json(
        { message: 'Email already verified. You can log in now.' },
        { status: 200 }
      );
    }

    // Rate limit: prevent resend if last code was sent < 60 seconds ago
    const creds = (user.credentials as any) || {};
    const lastSentStr = creds.codeSentAt;
    if (lastSentStr) {
      const lastSent = new Date(lastSentStr);
      const elapsed = Date.now() - lastSent.getTime();
      if (elapsed < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - elapsed) / 1000);
        return NextResponse.json(
          { error: `Please wait ${waitSeconds} seconds before requesting a new code.` },
          { status: 429 }
        );
      }
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Update user with new code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        credentials: {
          ...creds,
          verificationCode,
          codeExpiresAt: codeExpiresAt.toISOString(),
          codeSentAt: new Date().toISOString()
        }
      }
    });

    // Send the email
    try {
      const smtpResult = await selectSmtpAccountWithEnvFallback();
      if (!smtpResult.ok) {
        return NextResponse.json(
          { error: `Could not send email: ${smtpResult.errors.join(' || ')}` },
          { status: 500 }
        );
      }

      const transporter = smtpResult.account.transporter;
      const senderEmail = smtpResult.account.SMTP_USER;
      const senderName = process.env.SENDER_NAME || 'QuasarLeads';

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">QuasarLeads</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">Email Verification</p>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
            <h2 style="color: #1f2937; margin: 0 0 15px 0;">Hi ${user.username},</h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
              Here is your new verification code:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; background: white; border: 2px dashed #6366f1; border-radius: 8px; padding: 20px 40px;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6366f1;">${verificationCode}</span>
              </div>
            </div>
            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
              This code will expire in 10 minutes. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
            © ${new Date().getFullYear()} QuasarLeads. All rights reserved.
          </p>
        </div>
      `;

      const textContent = `Hi ${user.username},\n\nYour new verification code is: ${verificationCode}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n© ${new Date().getFullYear()} QuasarLeads`;

      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: email,
        subject: 'Your QuasarLeads Verification Code',
        text: textContent,
        html: htmlContent,
      });

      return NextResponse.json(
        { message: 'A new verification code has been sent to your email.' },
        { status: 200 }
      );

    } catch (sendError: any) {
      console.error('❌ Error resending verification email:', sendError);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again later.' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Resend code error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
