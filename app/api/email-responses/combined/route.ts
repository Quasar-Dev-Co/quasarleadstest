import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET: Fetches combined data of incoming emails with their AI responses
 * This provides a unified view for the email-responses page
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');
    const statusFilter = searchParams.get('status'); // optional filter: 'ready_to_send', 'sent'

    // Get userId from authorization header
    const authHeader = request.headers.get('authorization') || '';
    const bearerUserId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    console.log('📧 Combined API called, bearerUserId:', bearerUserId || '(none)');

    const where: any = {};
    if (bearerUserId) {
      where.userId = bearerUserId;
    }
    // If no userId, return all emails (admin view) — this is the existing behavior

    // Fetch emails with their latest AI response
    const emails = await prisma.incomingEmail.findMany({
      where: where,
      include: {
        aiResponses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    // Fetch lead data (email history) for each unique leadId
    const leadIds = [...new Set(emails.map(e => e.leadId).filter(Boolean))] as string[];
    const leads = leadIds.length > 0 ? await prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, email: true, name: true, company: true, emailHistory: true }
    }) : [];
    const leadMap = new Map(leads.map(l => [l.id, l]));

    const combinedData = emails.map(email => {
      const latestResponse = email.aiResponses?.[0] || null;
      const lead = email.leadId ? leadMap.get(email.leadId) : null;
      const emailHistory = (lead?.emailHistory as any[]) || [];
      // Get the last sent email (the one this reply is responding to)
      const sentEmails = emailHistory
        .filter((e: any) => e?.status === 'sent' && e?.sentAt)
        .sort((a: any, b: any) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      const lastSentEmail = sentEmails[0] || null;
      const sentEmailContent = lastSentEmail?.emailContent || {};

      return {
        email: {
          id: email.id,
          leadId: email.leadId || '',
          leadName: email.leadName,
          leadEmail: email.leadEmail,
          leadCompany: lead?.company || email.leadEmail.split('@')[1] || 'Unknown',
          subject: email.subject,
          content: email.content,
          htmlContent: email.htmlContent || '',
          status: email.status,
          receivedAt: email.receivedAt,
          respondedAt: email.respondedAt,
          isReply: email.isReply || false,
          isRecent: email.isRecent !== undefined ? email.isRecent : true,
          threadId: email.threadId || '',
          sentiment: email.sentiment || 'neutral',
          conversationCount: email.conversationCount || 1,
          isThirdReply: email.isThirdReply || false,
          metadata: email.metadata || {}
        },
        // The original email we sent that triggered this reply
        originalSentEmail: lastSentEmail ? {
          subject: sentEmailContent?.subject || lastSentEmail?.subject || '',
          content: sentEmailContent?.textContent || sentEmailContent?.text || '',
          htmlContent: sentEmailContent?.htmlContent || '',
          fromAddress: sentEmailContent?.from || '',
          sentAt: lastSentEmail.sentAt,
          stage: lastSentEmail?.stage || '',
        } : null,
        // Total sent emails count for this lead
        totalSentEmails: sentEmails.length,
        aiResponse: latestResponse ? {
          id: latestResponse.id,
          incomingEmailId: latestResponse.incomingEmailId || '',
          generatedSubject: latestResponse.generatedSubject,
          generatedContent: latestResponse.generatedContent,
          reasoning: latestResponse.reasoning || '',
          status: latestResponse.status,
          responseType: latestResponse.responseType || 'general',
          createdAt: latestResponse.createdAt,
          sentAt: latestResponse.sentAt
        } : null,
        hasResponse: latestResponse !== null
      };
    });

    // Apply status filter if requested
    let filteredData = combinedData;
    if (statusFilter === 'ready_to_send') {
      filteredData = combinedData.filter(item =>
        item.aiResponse &&
        (item.aiResponse.status === 'draft' || item.aiResponse.status === 'approved')
      );
    } else if (statusFilter === 'sent') {
      filteredData = combinedData.filter(item =>
        item.aiResponse && item.aiResponse.status === 'sent'
      );
    }

    const totalCount = await prisma.incomingEmail.count({ where });

    console.log(`📧 Combined API: returning ${combinedData.length} emails (total: ${totalCount})`);

    return NextResponse.json({
      success: true,
      data: filteredData,
      count: filteredData.length,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching combined email data:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch combined email data'
    }, { status: 500 });
  }
}
