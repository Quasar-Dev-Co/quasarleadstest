import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const incomingEmailId = String(body?.incomingEmailId || '').trim();

    if (!incomingEmailId) {
      return NextResponse.json({ success: false, error: 'Incoming email ID is required' }, { status: 400 });
    }

    const email = await prisma.incomingEmail.findUnique({
      where: { id: incomingEmailId },
      select: { id: true, userId: true },
    });

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email not found' }, { status: 404 });
    }

    if (!email.userId || email.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const [deletedResponses, deletedEmail] = await prisma.$transaction([
      prisma.aIResponse.deleteMany({
        where: {
          incomingEmailId,
        },
      }),
      prisma.incomingEmail.delete({
        where: { id: incomingEmailId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      deletedIncomingEmailId: deletedEmail.id,
      deletedResponses: deletedResponses.count,
      message: 'Message deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete message' },
      { status: 500 }
    );
  }
}
