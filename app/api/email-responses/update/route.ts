import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { responseId, generatedSubject, generatedContent } = await req.json();
    if (!responseId || !generatedSubject || !generatedContent) return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });

    const aiResponse = await prisma.aIResponse.findUnique({ where: { id: responseId } });
    if (!aiResponse) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (aiResponse.userId && aiResponse.userId !== userId) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    await prisma.aIResponse.update({
      where: { id: responseId },
      data: { generatedSubject, generatedContent }
    });

    return NextResponse.json({ success: true, message: 'Updated' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
