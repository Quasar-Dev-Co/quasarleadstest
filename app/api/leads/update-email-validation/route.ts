import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST: Manually update a lead's email validation status.
 * Allows users to mark an email as "valid" or "invalid" without running a scan.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { leadId, status } = body;

    if (!leadId) {
      return NextResponse.json(
        { success: false, error: 'leadId is required' },
        { status: 400 }
      );
    }

    if (status !== 'valid' && status !== 'invalid') {
      return NextResponse.json(
        { success: false, error: 'status must be "valid" or "invalid"' },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found' },
        { status: 404 }
      );
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        emailValidationStatus: status,
        emailValidationCheckedAt: new Date(),
        emailValidationDetails: {
          isValid: status === 'valid',
          reason: status === 'valid' ? 'manually_marked_valid' : 'manually_marked_invalid',
          source: 'manual',
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Email marked as ${status}`,
      leadId,
      emailValidationStatus: status,
    });
  } catch (error: any) {
    console.error('Error updating email validation status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update email validation status' },
      { status: 500 }
    );
  }
}
