import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const userId = authHeader.replace('Bearer ', '');
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.admin) {
      return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
    }

    const allUsers = await prisma.user.findMany({
      select: { id: true, username: true, email: true }
    });

    const allLeads = await prisma.lead.findMany({
      select: { id: true, name: true, assignedTo: true, leadsCreatedBy: true, status: true, createdAt: true }
    });

    const allBookings = await prisma.booking.findMany({
      select: { id: true, companyName: true, clientName: true, assignedTo: true, userId: true, status: true, preferredDate: true }
    });

    const leadsByUser = allUsers.map(u => {
      const count = allLeads.filter(l => l.assignedTo === u.id || l.leadsCreatedBy === u.id).length;
      return count > 0 ? { name: u.username, value: count, email: u.email } : null;
    }).filter(Boolean);

    const bookingsByUser = allUsers.map(u => {
      const count = allBookings.filter(b => b.assignedTo === u.id || b.userId === u.id).length;
      return count > 0 ? { name: u.username, value: count, email: u.email } : null;
    }).filter(Boolean);

    const currentYear = new Date().getFullYear();
    const monthlyData = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let month = 0; month < 12; month++) {
      const start = new Date(currentYear, month, 1);
      const end = new Date(currentYear, month + 1, 0);
      const count = allLeads.filter(l => {
        const d = new Date(l.createdAt);
        return d >= start && d <= end;
      }).length;
      monthlyData.push({ month: monthNames[month], leads: count });
    }

    return NextResponse.json({
      success: true,
      data: {
        monthlyLeads: monthlyData,
        leadsByUser,
        bookingsByUser
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching leads analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
