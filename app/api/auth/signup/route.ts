import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { selectSmtpAccountWithEnvFallback } from '@/lib/smtp-rotation';

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification code email using env-based SMTP (no user credentials yet)
async function sendVerificationEmail(toEmail: string, code: string, username: string): Promise<{ success: boolean; error?: string }> {
  try {
    const smtpResult = await selectSmtpAccountWithEnvFallback();
    if (!smtpResult.ok) {
      return { success: false, error: `SMTP not configured: ${smtpResult.errors.join(' || ')}` };
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
          <h2 style="color: #1f2937; margin: 0 0 15px 0;">Hi ${username},</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Welcome to QuasarLeads! Please use the verification code below to complete your registration:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: white; border: 2px dashed #6366f1; border-radius: 8px; padding: 20px 40px;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6366f1;">${code}</span>
            </div>
          </div>
          <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
            This code will expire in 10 minutes. If you didn't create an account with QuasarLeads, you can safely ignore this email.
          </p>
        </div>
        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
          © ${new Date().getFullYear()} QuasarLeads. All rights reserved.
        </p>
      </div>
    `;

    const textContent = `Hi ${username},\n\nWelcome to QuasarLeads!\n\nYour verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't create an account, you can safely ignore this email.\n\n© ${new Date().getFullYear()} QuasarLeads`;

    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toEmail,
      subject: 'Your QuasarLeads Verification Code',
      text: textContent,
      html: htmlContent,
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ Error sending verification email:', error);
    return { success: false, error: error.message || 'Failed to send verification email' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json();

    // Validate input
    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email or username already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate verification code and set expiry (10 minutes)
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Create new user with verification code stored in credentials JSON
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        verified: false,
        admin: false,
        credentials: {
          verificationCode,
          codeExpiresAt: codeExpiresAt.toISOString(),
          codeSentAt: new Date().toISOString()
        }
      }
    });

    // Send verification code email
    const emailResult = await sendVerificationEmail(email, verificationCode, username);

    if (!emailResult.success) {
      console.error('⚠️ Verification email failed to send, but user was created:', emailResult.error);
      // Still return success - user can request a resend
    }

    // Return success without password
    const { password: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      {
        message: emailResult.success
          ? 'Account created! A verification code has been sent to your email.'
          : 'Account created, but we could not send the verification email. Please click resend.',
        user: userWithoutPassword,
        verificationEmailSent: emailResult.success,
        emailError: emailResult.success ? undefined : emailResult.error
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
