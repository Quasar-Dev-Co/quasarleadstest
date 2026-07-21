import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - Verify email with 6-digit code
export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and verification code are required' },
        { status: 400 }
      );
    }

    // Find user by email
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

    // Get stored verification code from credentials JSON
    const creds = (user.credentials as any) || {};
    const storedCode = creds.verificationCode;
    const expiresAtStr = creds.codeExpiresAt;

    if (!storedCode || !expiresAtStr) {
      return NextResponse.json(
        { error: 'No verification code found. Please request a new code.' },
        { status: 400 }
      );
    }

    // Check if code has expired
    const expiresAt = new Date(expiresAtStr);
    if (new Date() > expiresAt) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new code.' },
        { status: 400 }
      );
    }

    // Check if code matches
    if (String(storedCode) !== String(code).trim()) {
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      );
    }

    // Verify the user and clear the verification code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verified: true,
        credentials: {
          ...creds,
          verificationCode: null,
          codeExpiresAt: null,
          verifiedAt: new Date().toISOString()
        }
      }
    });

    return NextResponse.json(
      {
        message: 'Email verified successfully! You can now log in to your account.',
        verified: true
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('Verify email error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
