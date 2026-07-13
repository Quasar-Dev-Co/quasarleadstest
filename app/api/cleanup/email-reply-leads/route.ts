import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST: Delete bogus 'Email Reply' leads and their incoming email records.
 * These were created by the IMAP fetcher treating random inbox emails as lead replies.
 * Requires authentication. Only the authenticated user's own leads are deleted,
 * unless the caller is an admin (then all email-reply leads are cleaned).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const bearerUserId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!bearerUserId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required. Provide Bearer token.' },
        { status: 401 }
      );
    }

    const userId = bearerUserId;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, admin: true }
    });

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // Non-admins can only clean their own leads; admins can clean all.
    const leadWhere = currentUser.admin
      ? { source: 'email-reply' as const }
      : { source: 'email-reply' as const, assignedTo: userId };

    const bogusLeads = await prisma.lead.findMany({
      where: leadWhere,
      select: { id: true, email: true, name: true, company: true }
    });

    console.log(`🧹 Cleanup: Found ${bogusLeads.length} bogus 'email-reply' leads for user ${userId}.`);

    if (bogusLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No bogus email-reply leads found. Nothing to clean.',
        deletedLeads: 0,
        deletedEmails: 0
      });
    }

    const leadIds = bogusLeads.map((l) => l.id);

    // Delete associated incoming emails first (foreign key safety).
    const deletedEmails = await prisma.incomingEmail.deleteMany({
      where: { leadId: { in: leadIds } }
    });

    // Delete the bogus leads.
    const deletedLeads = await prisma.lead.deleteMany({
      where: { id: { in: leadIds } }
    });

    // Also clean any remaining incoming emails from blocked sender patterns.
    const blockedPatterns = ['mailer-daemon', 'postmaster', 'mailerdaemon', 'no-reply', 'noreply'];
    const allIncoming = await prisma.incomingEmail.findMany({
      where: currentUser.admin ? undefined : { userId },
      select: { id: true, leadEmail: true }
    });
    const blockedEmails = allIncoming.filter((e) =>
      blockedPatterns.some((p) => e.leadEmail.toLowerCase().includes(p))
    );

    let deletedBlocked = 0;
    if (blockedEmails.length > 0) {
      const blockedIds = blockedEmails.map((e) => e.id);
      const result = await prisma.incomingEmail.deleteMany({
        where: { id: { in: blockedIds } }
      });
      deletedBlocked = result.count;
    }

    console.log(`🧹 Cleanup complete: ${deletedLeads.count} leads, ${deletedEmails.count} incoming emails, ${deletedBlocked} blocked-sender emails deleted.`);

    return NextResponse.json({
      success: true,
      message: `Cleanup complete. Deleted ${deletedLeads.count} bogus leads, ${deletedEmails.count} incoming emails, and ${deletedBlocked} blocked-sender emails.`,
      deletedLeads: deletedLeads.count,
      deletedEmails: deletedEmails.count,
      deletedBlockedSenderEmails: deletedBlocked,
      details: bogusLeads.map((l) => ({ name: l.name, email: l.email, company: l.company }))
    });
  } catch (error: any) {
    console.error('❌ Cleanup failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Cleanup failed' },
      { status: 500 }
    );
  }
}
