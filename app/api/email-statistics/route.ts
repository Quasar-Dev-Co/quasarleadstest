import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET handler for email statistics
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }
    
    // Get leads with email history for this user
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { assignedTo: userId },
          { leadsCreatedBy: userId }
        ]
      },
      select: {
        emailHistory: true,
        emailSequenceStage: true,
        company: true
      }
    });
    
    // Calculate statistics from email history
    let totalSent = 0;
    let totalOpened = 0;
    let totalReplied = 0;
    
    leads.forEach(lead => {
      const history = lead.emailHistory as any;
      if (Array.isArray(history)) {
        totalSent += history.length;
        totalOpened += history.filter((h: any) => h.opened).length;
        totalReplied += history.filter((h: any) => h.replied).length;
      }
    });
    
    return NextResponse.json({
      success: true,
      statistics: {
        totalSent,
        totalOpened,
        totalReplied,
        openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0',
        replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching email statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch email statistics' },
      { status: 500 }
    );
  }
}
