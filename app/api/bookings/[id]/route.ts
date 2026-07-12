export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bookingEmailService } from '@/lib/bookingEmailService';
import { ZoomService } from '@/lib/zoomService';
import { GoogleCalendarService } from '@/lib/googleCalendarService';

/**
 * GET handler for retrieving a specific booking by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const booking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: booking
    });

  } catch (error: any) {
    console.error('Error fetching booking:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch booking'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating a booking (status, meeting link, etc.)
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const {
      status,
      meetingLink,
      assignedTo,
      internalNotes,
      actualMeetingDate,
      actualMeetingTime,
      followUpDate
    } = body;

    const booking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Before applying updates, enforce Zoom and Google credential requirement when confirming
    if (status === 'confirmed') {
      const platform = booking.meetingPlatform;
      if (platform === 'zoom') {
        const ownerUserId = booking.userId || booking.assignedTo;
        let userCreds: any = null;
        if (ownerUserId) {
          const owner = await prisma.user.findUnique({
            where: { id: ownerUserId },
            select: { credentials: true }
          });
          userCreds = owner?.credentials || null;
        }
        if (!userCreds?.ZOOM_ACCOUNT_ID || !userCreds?.ZOOM_CLIENT_ID || !userCreds?.ZOOM_CLIENT_SECRET) {
          return NextResponse.json(
            {
              success: false,
              error: 'Zoom credentials are not present in user profile. Please add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET before confirming.'
            },
            { status: 400 }
          );
        }
      }

      const ownerUserIdForG = booking.userId || booking.assignedTo;
      let ownerGCreds: any = null;
      if (ownerUserIdForG) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerUserIdForG },
          select: { credentials: true }
        });
        ownerGCreds = owner?.credentials || null;
      }
      if (!ownerGCreds?.GOOGLE_SERVICE_ACCOUNT_EMAIL || !ownerGCreds?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !ownerGCreds?.GOOGLE_CALENDAR_ID) {
        return NextResponse.json(
          {
            success: false,
            error: 'Google Calendar credentials are missing. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID in Account Settings > Credentials before confirming.'
          },
          { status: 400 }
        );
      }
    }

    // Update fields if provided
    const data: any = {};

    if (status) {
      const validStatuses = ['pending', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status' },
          { status: 400 }
        );
      }

      data.status = status;

      if (status === 'confirmed' && booking.status !== 'confirmed') {
        data.confirmedAt = new Date();
      } else if (status === 'completed' && booking.status !== 'completed') {
        data.completedAt = new Date();
      } else if (status === 'cancelled' && booking.status !== 'cancelled') {
        data.cancelledAt = new Date();
      }
    }

    if (meetingLink) data.meetingLink = meetingLink;
    if (assignedTo) data.assignedTo = assignedTo;
    if (internalNotes) data.internalNotes = internalNotes;
    if (actualMeetingDate) data.actualMeetingDate = new Date(actualMeetingDate);
    if (actualMeetingTime) data.actualMeetingTime = actualMeetingTime;
    if (followUpDate) data.followUpDate = new Date(followUpDate);

    // Update the booking using Prisma
    let updatedBooking = await prisma.booking.update({
      where: { id },
      data: data
    });

    console.log(`✅ Booking updated: ${id} - Status: ${status || 'unchanged'}`);

    if (status === 'confirmed' && booking.status !== 'confirmed') {
      try {
        let zoomMeeting = null;
        let finalMeetingLink = meetingLink;

        if (updatedBooking.meetingPlatform === 'zoom') {
          const meetingTopic = `QuasarLeads Strategy Call - \${updatedBooking.companyName}`;
          const startDateTime = new Date(updatedBooking.actualMeetingDate || updatedBooking.preferredDate);
          const startTime = updatedBooking.actualMeetingTime || updatedBooking.preferredTime;

          const [hours, minutes] = startTime.split(':');
          startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          try {
            console.log(`🔄 Creating Zoom meeting for \${updatedBooking.companyName}...`);
            const ownerUserId = updatedBooking.userId || updatedBooking.assignedTo;
            let userCreds: any = null;
            if (ownerUserId) {
              const owner = await prisma.user.findUnique({
                where: { id: ownerUserId },
                select: { credentials: true }
              });
              userCreds = owner?.credentials || null;
            }

            if (!userCreds?.ZOOM_ACCOUNT_ID || !userCreds?.ZOOM_CLIENT_ID || !userCreds?.ZOOM_CLIENT_SECRET) {
              throw new Error('Missing Zoom credentials in user profile');
            }

            const zoomService = new ZoomService({
              accountId: String(userCreds.ZOOM_ACCOUNT_ID),
              clientId: String(userCreds.ZOOM_CLIENT_ID),
              clientSecret: String(userCreds.ZOOM_CLIENT_SECRET),
            });

            zoomMeeting = await zoomService.createMeeting(
              meetingTopic,
              startDateTime.toISOString(),
              60,
              updatedBooking.timezone,
              updatedBooking.companyEmail
            );

            const zoomUpdates: any = {
              meetingLink: zoomMeeting.join_url,
              meetingId: zoomMeeting.id,
              meetingPassword: zoomMeeting.password,
              meetingHost: zoomMeeting.host_email,
              meetingPlatformData: {
                platform: 'zoom',
                id: zoomMeeting.id,
                join_url: zoomMeeting.join_url,
                password: zoomMeeting.password,
                host_email: zoomMeeting.host_email,
                created_at: new Date()
              }
            };

            updatedBooking = await prisma.booking.update({
              where: { id },
              data: zoomUpdates
            });
            finalMeetingLink = zoomMeeting.join_url;

            console.log(`✅ Zoom meeting created successfully`);
          } catch (zoomError: any) {
            console.error(`❌ Failed to create Zoom meeting: \${zoomError.message}`);
            if (meetingLink) {
              finalMeetingLink = meetingLink;
            } else {
              throw new Error(`Failed to create Zoom meeting and no manual meeting link provided`);
            }
          }
        }

        // Google Calendar
        try {
          const ownerUserId = updatedBooking.userId || updatedBooking.assignedTo;
          let userCreds: any = null;
          if (ownerUserId) {
            const owner = await prisma.user.findUnique({
              where: { id: ownerUserId },
              select: { credentials: true }
            });
            userCreds = owner?.credentials || null;
          }

          if (userCreds?.GOOGLE_SERVICE_ACCOUNT_EMAIL && userCreds?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && userCreds?.GOOGLE_CALENDAR_ID) {
            const startDate = new Date(updatedBooking.actualMeetingDate || updatedBooking.preferredDate);
            const [h, m] = (updatedBooking.actualMeetingTime || updatedBooking.preferredTime).split(':');
            startDate.setHours(parseInt(h), parseInt(m), 0, 0);
            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

            const perUserGoogle = new GoogleCalendarService({
              clientEmail: String(userCreds.GOOGLE_SERVICE_ACCOUNT_EMAIL),
              privateKey: String(userCreds.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
              calendarId: String(userCreds.GOOGLE_CALENDAR_ID)
            });

            const event = await perUserGoogle.createEvent({
              summary: `Meeting: \${updatedBooking.companyName}`,
              description: `Platform: \${updatedBooking.meetingPlatform}\nAttendees: \${updatedBooking.memberCount}\nLink: \${finalMeetingLink || ''}`,
              startDateTimeISO: startDate.toISOString(),
              endDateTimeISO: endDate.toISOString(),
              timeZone: updatedBooking.timezone,
              attendees: [{ email: updatedBooking.companyEmail, displayName: updatedBooking.clientName }],
            });

            updatedBooking = await prisma.booking.update({
              where: { id },
              data: {
                calendarEventId: event.id,
                calendarEventLink: event.htmlLink || '',
              }
            });
          }
        } catch (gcErr: any) {
          console.error('❌ Failed to create Google Calendar event:', gcErr?.message);
        }

        // Email confirmation
        const ownerUserId = (updatedBooking.userId || updatedBooking.assignedTo) || undefined;
        await bookingEmailService.sendMeetingConfirmation({
          companyName: updatedBooking.companyName,
          companyEmail: updatedBooking.companyEmail,
          companyPhone: updatedBooking.companyPhone || undefined,
          clientName: updatedBooking.clientName,
          position: updatedBooking.position,
          memberCount: updatedBooking.memberCount,
          meetingPlatform: updatedBooking.meetingPlatform,
          preferredDate: updatedBooking.preferredDate.toISOString(),
          preferredTime: updatedBooking.preferredTime,
          timezone: updatedBooking.timezone,
          additionalNotes: updatedBooking.additionalNotes || undefined,
          meetingLink: finalMeetingLink || '',
          actualMeetingDate: (updatedBooking.actualMeetingDate || updatedBooking.preferredDate).toISOString(),
          actualMeetingTime: (updatedBooking.actualMeetingTime || updatedBooking.preferredTime) || '',
          zoomMeeting: zoomMeeting || undefined
        }, ownerUserId);

      } catch (confirmationError: any) {
        console.error(`❌ Error in booking confirmation process: \${confirmationError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Booking updated successfully',
      data: updatedBooking
    });

  } catch (error: any) {
    console.error('❌ Error updating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update booking', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for deleting a booking
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const booking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    await prisma.booking.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Booking deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting booking:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete booking' },
      { status: 500 }
    );
  }
} 