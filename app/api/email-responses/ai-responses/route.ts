import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const status = searchParams.get('status');
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const responses = await prisma.aIResponse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    const totalCount = await prisma.aIResponse.count({ where });

    return NextResponse.json({
      success: true,
      responses: responses.map(r => ({
        id: r.id,
        incomingEmailId: r.incomingEmailId,
        generatedSubject: r.generatedSubject,
        generatedContent: r.generatedContent,
        confidence: 85,
        reasoning: r.reasoning,
        status: r.status,
        createdAt: r.createdAt,
        sentAt: r.sentAt,
        responseType: r.responseType
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}