import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { userId, action } = await request.json();
    if (!userId || !action) return NextResponse.json({ error: 'User ID and action required' }, { status: 400 });
    if (!['verify', 'reject'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (action === 'verify') {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { verified: true }
      });
      return NextResponse.json({ message: 'User verified', user: { id: updated.id, username: updated.username, email: updated.email, verified: updated.verified, admin: updated.admin } });
    } else {
      await prisma.user.delete({ where: { id: userId } });
      return NextResponse.json({ message: 'User rejected and deleted' });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const unverifiedUsers = await prisma.user.findMany({ where: { verified: false } });
    return NextResponse.json({ users: unverifiedUsers, count: unverifiedUsers.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}