import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get user ID from the request headers or query params
    const userId = request.headers.get('x-user-id') || request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Find user by ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        verified: true,
        admin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        _id: user.id, // For backward compatibility
        username: user.username,
        email: user.email,
        verified: user.verified,
        admin: user.admin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error: any) {
    console.error('Get user error:', error);

    // Check for Prisma connection errors
    if (error.message?.includes('Can\'t reach database server') || error.code === 'P1001') {
      return NextResponse.json(
        { error: 'Database connection failed. Please ensure your IP is whitelisted in AWS RDS.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}