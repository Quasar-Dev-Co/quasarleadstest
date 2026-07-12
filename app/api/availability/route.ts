import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || searchParams.get('adminId') || '';
    if (!userId) return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });

    let availability = await prisma.availability.findUnique({ where: { userId } });

    if (!availability) {
      availability = await prisma.availability.create({
        data: {
          userId,
          workingDays: [
            { day: 'monday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'tuesday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'wednesday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'thursday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'friday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'saturday', isAvailable: true, timeSlots: [{ start: '09:00', end: '17:00' }] },
            { day: 'sunday', isAvailable: false, timeSlots: [] }
          ] as any,
          timezone: 'Europe/Amsterdam',
          slotDuration: 30,
          bufferTime: 15,
          isActive: true
        }
      });
    }

    return NextResponse.json({ success: true, data: availability });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, workingDays, slotDuration, bufferTime } = body;
    if (!userId) return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });

    const updated = await prisma.availability.upsert({
      where: { userId },
      update: { workingDays, slotDuration, bufferTime },
      create: {
        userId,
        workingDays: workingDays || [],
        timezone: 'Europe/Amsterdam',
        slotDuration: slotDuration || 30,
        bufferTime: bufferTime || 15,
        isActive: true
      }
    });

    return NextResponse.json({ success: true, message: 'Availability updated', data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}