import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/leads/tab-counts?userId=xxx
 * Returns lead counts per tab without fetching any lead data.
 * Used for tab badge counts in the paginated leads page.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }

    const baseWhere = {
      OR: [
        { assignedTo: userId },
        { leadsCreatedBy: userId },
      ],
    };

    const [
      newLeadsCount,
      processingCount,
      emailedCount,
      repliedCount,
      totalCount,
    ] = await Promise.all([
      // New leads: not replied, no email automation, no email history
      prisma.lead.count({
        where: {
          ...baseWhere,
          status: { not: 'replied' },
          emailSequenceActive: { not: true },
          OR: [
            { assignedTo: userId, emailHistory: { equals: [] as any } },
            { assignedTo: userId, emailHistory: { equals: null as any } },
            { leadsCreatedBy: userId, emailHistory: { equals: [] as any } },
            { leadsCreatedBy: userId, emailHistory: { equals: null as any } },
          ],
        },
      }),
      // Processing: email automation active, not completed, not replied
      prisma.lead.count({
        where: {
          ...baseWhere,
          status: { not: 'replied' },
          emailSequenceActive: true,
          emailSequenceStage: { not: 'called_seven_times' },
        },
      }),
      // Emailed: sequence completed or history exists but inactive, not replied
      prisma.lead.count({
        where: {
          ...baseWhere,
          status: { not: 'replied' },
          OR: [
            {
              emailSequenceActive: { not: true },
              NOT: { emailHistory: { equals: [] as any } },
            },
            { emailSequenceStage: 'called_seven_times' },
          ],
        },
      }),
      // Replied
      prisma.lead.count({
        where: {
          ...baseWhere,
          status: 'replied',
        },
      }),
      // Total
      prisma.lead.count({ where: baseWhere }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        'new-leads': newLeadsCount,
        'processing-leads': processingCount,
        'emailed-leads': emailedCount,
        'replied-leads': repliedCount,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching tab counts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tab counts' },
      { status: 500 }
    );
  }
}
