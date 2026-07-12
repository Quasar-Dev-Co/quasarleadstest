import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';
import { createEmailTracking, injectTrackingPixel } from '@/lib/email-tracking';

/**
 * Vercel Cron Job: Auto-sends draft AI responses for users with autoReplyEnabled = true.
 * Runs every 1 minute.
 *
 * Flow:
 * 1. Find all users with autoReplyEnabled = true in their AISettings
 * 2. For each user, find AIResponse records with status 'draft' or 'sending'
 * 3. Send each draft via SMTP using the user's credentials
 * 4. Update AIResponse status to 'sent' and IncomingEmail status to 'responded'
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('📤 Auto-Send Responses Cron: Starting...');

  try {
    // Find all AI settings where autoReplyEnabled is true
    const autoReplySettings = await prisma.aISettings.findMany({
      where: { autoReplyEnabled: true },
      select: { userId: true }
    });

    if (autoReplySettings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users with auto-reply enabled',
        summary: { usersProcessed: 0, totalSent: 0, totalErrors: 0 }
      });
    }

    console.log(`📧 Found ${autoReplySettings.length} users with auto-reply enabled`);

    let totalSent = 0;
    let totalErrors = 0;
    const userResults: any[] = [];

    for (const setting of autoReplySettings) {
      const userId = setting.userId;
      if (!userId) continue;

      const result = await processUserAutoSend(userId);
      userResults.push(result);
      totalSent += result.sent;
      totalErrors += result.errors;
    }

    console.log(`✅ Auto-send complete: ${totalSent} sent, ${totalErrors} errors`);

    return NextResponse.json({
      success: true,
      message: 'Auto-send responses processed',
      summary: {
        usersProcessed: autoReplySettings.length,
        totalSent,
        totalErrors
      },
      userResults
    });

  } catch (error: any) {
    console.error('❌ Fatal error in auto-send cron:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function processUserAutoSend(userId: string): Promise<{ userId: string; sent: number; errors: number; message?: string }> {
  try {
    // Verify user has SMTP credentials
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true, email: true }
    });

    if (!user) {
      return { userId, sent: 0, errors: 0, message: 'User not found' };
    }

    const creds = (user.credentials as any) || {};
    const missingSmtp = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'].filter(k => !creds[k]);
    if (missingSmtp.length > 0) {
      return { userId, sent: 0, errors: 0, message: `Missing SMTP: ${missingSmtp.join(', ')}` };
    }

    // Find all draft/sending AI responses for this user
    const draftResponses = await prisma.aIResponse.findMany({
      where: {
        userId: userId,
        status: { in: ['draft', 'sending'] }
      },
      include: {
        incomingEmail: true
      },
      orderBy: { createdAt: 'asc' }
    });

    if (draftResponses.length === 0) {
      return { userId, sent: 0, errors: 0, message: 'No draft responses to send' };
    }

    console.log(`📨 Processing ${draftResponses.length} draft responses for user ${user.email}`);

    let sent = 0;
    let errors = 0;

    for (const draft of draftResponses) {
      try {
        const originalEmail = draft.incomingEmail;
        if (!originalEmail) {
          console.error(`❌ Original email not found for AI response ${draft.id}`);
          errors++;
          continue;
        }

        // Skip if already responded
        if (originalEmail.status === 'responded') {
          console.log(`⏭️ Email ${originalEmail.id} already responded, skipping`);
          continue;
        }

        // Skip if content is empty (failed generation)
        if (!draft.generatedContent || draft.generatedContent.trim().length < 20) {
          console.log(`⏭️ AI response ${draft.id} has empty content, skipping`);
          await prisma.aIResponse.update({
            where: { id: draft.id },
            data: { status: 'failed', lastError: 'Empty content - cannot auto-send' }
          });
          errors++;
          continue;
        }

        const htmlContent = `<div style="font-family: Arial, sans-serif;">${draft.generatedContent.replace(/\n/g, '<br>')}</div>`;
        let finalHtml = htmlContent;
        let trackingId = '';
        if (originalEmail.leadId) {
          trackingId = await createEmailTracking({
            leadId: originalEmail.leadId,
            userId,
            stage: 'ai_auto_reply',
            recipientEmail: originalEmail.leadEmail,
            subject: draft.generatedSubject,
          });
          if (trackingId) {
            finalHtml = injectTrackingPixel(htmlContent, trackingId);
          }
        }

        const emailConfig = {
          to: originalEmail.leadEmail,
          subject: draft.generatedSubject,
          text: draft.generatedContent,
          html: finalHtml,
        };

        const result = await emailService.sendEmailForUser(userId, emailConfig);

        if (result.success) {
          await prisma.aIResponse.update({
            where: { id: draft.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              sentMessageId: result.messageId
            }
          });

          await prisma.incomingEmail.update({
            where: { id: originalEmail.id },
            data: {
              status: 'responded',
              respondedAt: new Date()
            }
          });

          console.log(`✅ Auto-sent reply to ${originalEmail.leadEmail} for user ${user.email}`);
          sent++;
        } else {
          await prisma.aIResponse.update({
            where: { id: draft.id },
            data: { status: 'failed', lastError: result.error }
          });
          console.error(`❌ Failed to auto-send to ${originalEmail.leadEmail}: ${result.error}`);
          errors++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing draft ${draft.id}:`, error.message);
        errors++;
      }
    }

    return { userId, sent, errors };

  } catch (error: any) {
    console.error(`❌ Error in processUserAutoSend for ${userId}:`, error.message);
    return { userId, sent: 0, errors: 1, message: error.message };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
