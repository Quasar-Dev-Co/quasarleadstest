import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET handler for retrieving bookings
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const status = url.searchParams.get('status');
    const email = url.searchParams.get('email');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }
    
    const where: any = { userId };
    if (status) {
      where.status = status;
    }
    if (email) {
      where.companyEmail = {
        contains: email,
        mode: 'insensitive',
      };
    }
    
    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const summary = bookings.reduce(
      (acc, booking) => {
        const statusKey = booking.status as keyof typeof acc;
        if (statusKey in acc) {
          acc[statusKey] += 1;
        }
        return acc;
      },
      {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        rescheduled: 0,
        no_show: 0,
      }
    );

    const normalizedBookings = bookings.map((booking) => ({
      ...booking,
      _id: booking.id,
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        bookings: normalizedBookings,
        summary,
        total: bookings.length,
      },
      bookings: normalizedBookings,
      total: bookings.length,
      summary,
    });
    
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating new booking
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ...bookingData } = body;
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const booking = await prisma.booking.create({
      data: {
        ...bookingData,
        userId,
        status: 'pending'
      }
    });
    
    return NextResponse.json({
      success: true,
      booking
    });
    
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}
