import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '').trim();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({ where: { id: userId } });
    if (!requester || !requester.admin) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const userStats = await Promise.all(users.map(async (u) => {
      const leadsCount = await prisma.lead.count({
        where: { OR: [{ assignedTo: u.id }, { leadsCreatedBy: u.id }] }
      });
      const bookingsCount = await prisma.booking.count({
        where: { OR: [{ userId: u.id }, { assignedTo: u.id }] }
      });

      return {
        _id: u.id,
        username: u.username,
        email: u.email,
        verified: u.verified,
        admin: u.admin,
        createdAt: u.createdAt,
        leadsCount,
        bookingsCount
      };
    }));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalUsers: users.length,
          activeUsers: users.filter(u => u.verified).length,
          totalLeads: userStats.reduce((s, u) => s + u.leadsCount, 0),
          totalBookings: userStats.reduce((s, u) => s + u.bookingsCount, 0)
        },
        users: userStats
      }
    });
  } catch (error: any) {
    console.error('Error fetching admin all-leads overview:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
