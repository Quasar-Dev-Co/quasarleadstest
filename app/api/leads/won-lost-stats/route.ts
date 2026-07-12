import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET handler for won/lost statistics
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
    
    // Get all leads with won/lost status
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { assignedTo: userId },
          { leadsCreatedBy: userId }
        ],
        status: {
          in: ['closed won', 'closed lost']
        }
      },
      select: {
        status: true,
        budget: true,
        lossReason: true,
        closedDate: true
      }
    });
    
    // Calculate statistics
    const wonLeads = leads.filter(l => l.status === 'closed won');
    const lostLeads = leads.filter(l => l.status === 'closed lost');
    
    const totalWonBudget = wonLeads.reduce((sum, l) => sum + (l.budget || 0), 0);
    const totalLostBudget = lostLeads.reduce((sum, l) => sum + (l.budget || 0), 0);
    
    const winRate = leads.length > 0 
      ? ((wonLeads.length / leads.length) * 100).toFixed(1)
      : '0';
    
    // Group loss reasons with budget
    const lostByReason: Record<string, { count: number; budget: number }> = {};
    lostLeads.forEach(lead => {
      const reason = lead.lossReason || 'unknown';
      if (!lostByReason[reason]) {
        lostByReason[reason] = { count: 0, budget: 0 };
      }
      lostByReason[reason].count += 1;
      lostByReason[reason].budget += lead.budget || 0;
    });
    
    // Generate monthly data for last 6 months
    const monthlyData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString('en-US', { month: 'short' });
      
      const monthLeads = leads.filter(l => {
        if (!l.closedDate) return false;
        const closedDate = new Date(l.closedDate);
        return closedDate.getMonth() === date.getMonth() && 
               closedDate.getFullYear() === date.getFullYear();
      });
      
      const monthWon = monthLeads.filter(l => l.status === 'closed won');
      const monthLost = monthLeads.filter(l => l.status === 'closed lost');
      
      monthlyData.push({
        month: monthName,
        won: monthWon.length,
        lost: monthLost.length,
        wonBudget: monthWon.reduce((sum, l) => sum + (l.budget || 0), 0),
        lostBudget: monthLost.reduce((sum, l) => sum + (l.budget || 0), 0)
      });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalWon: wonLeads.length,
          totalLost: lostLeads.length,
          wonBudget: totalWonBudget,
          lostBudget: totalLostBudget,
          totalBudget: totalWonBudget + totalLostBudget,
          conversionRate: winRate
        },
        lostByReason,
        monthlyData
      }
    });
    
  } catch (error) {
    console.error('Error fetching won/lost statistics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
