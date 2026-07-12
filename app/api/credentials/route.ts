import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    let user;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId }, select: { credentials: true } });
    }

    if (!user && !userId) {
      user = await prisma.user.findFirst({ where: { admin: true }, select: { credentials: true } });
    }

    return NextResponse.json({ success: true, credentials: (user?.credentials as any) || {} });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const credentials = body.credentials || body;

    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findFirst({ where: { admin: true } });

    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const updatedCredentials = { ...((user.credentials as any) || {}), ...credentials };

    await prisma.user.update({
      where: { id: user.id },
      data: { credentials: updatedCredentials as any }
    });

    return NextResponse.json({ success: true, message: 'Credentials saved' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
