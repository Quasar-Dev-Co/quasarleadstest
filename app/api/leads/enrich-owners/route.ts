import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateExistingLeadsWithOwners } from '@/lib/leadEnrichment';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userId, companyNames } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
    }

    const result = await updateExistingLeadsWithOwners(userId, companyNames);

    return NextResponse.json({
      success: true,
      message: `Owner enrichment completed. Updated \${result.updated} out of \${result.total} leads.`,
      stats: result
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    message: 'Lead owner enrichment API endpoint'
  });
}
