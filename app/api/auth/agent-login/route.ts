import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const returnUrl = searchParams.get('returnUrl');
  const userId = searchParams.get('userId');

  // Validate returnUrl to prevent open redirect attacks
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const extraAllowedPrefixes = (process.env.AGENT_LOGIN_ALLOWED_REDIRECT_PREFIXES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedDomains = [configuredAppUrl, 'http://localhost:3000', ...extraAllowedPrefixes].filter(Boolean) as string[];

  if (!returnUrl || !allowedDomains.some(domain => returnUrl.startsWith(domain))) {
    return NextResponse.json(
      { error: 'Invalid return URL' },
      { status: 400 }
    );
  }

  // Check if userId is provided (from frontend session)
  if (!userId) {
    // Redirect to login page with return path
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Fetch user from database to validate session
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        verified: true,
        admin: true,
      }
    });

    if (!user) {
      // User not found, redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', request.url);
      return NextResponse.redirect(loginUrl);
    }

    if (!user.verified) {
      return NextResponse.json(
        { error: 'Account not verified' },
        { status: 403 }
      );
    }

    // Generate JWT token using jose (same as qllnkagent)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json(
        { error: 'JWT secret is not configured' },
        { status: 500 }
      );
    }

    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(jwtSecret);

    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.admin ? 'admin' : 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Redirect back to qllnkagent with token
    const redirectUrl = `${returnUrl}?token=${token}`;
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Agent login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
