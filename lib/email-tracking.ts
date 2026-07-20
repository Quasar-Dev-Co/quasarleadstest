import { prisma } from '@/lib/prisma';
import { isBotRequest, identifyBot } from '@/lib/bot-detection';

/**
 * Get the base URL for tracking pixel requests.
 * Falls back to APP_BASE_URL, then NEXT_PUBLIC_APP_URL.
 */
function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/**
 * Create an EmailOpenTracking record before sending an email.
 * Returns the tracking ID to embed in the email pixel.
 */
export async function createEmailTracking(params: {
  leadId: string;
  userId?: string;
  stage?: string;
  recipientEmail?: string;
  subject?: string;
}): Promise<string> {
  try {
    const record = await prisma.emailOpenTracking.create({
      data: {
        leadId: params.leadId,
        userId: params.userId || null,
        stage: params.stage || null,
        recipientEmail: params.recipientEmail || null,
        subject: params.subject || null,
      },
    });
    return record.id;
  } catch (error) {
    console.error('Failed to create email tracking record:', error);
    return '';
  }
}

/**
 * Inject a 1x1 transparent tracking pixel into HTML email content.
 * The pixel URL points to /api/email-track/[trackingId] which records the open.
 */
export function injectTrackingPixel(html: string, trackingId: string): string {
  if (!trackingId || !html) return html;

  const baseUrl = getBaseUrl();
  const pixelUrl = `${baseUrl}/api/email-track/${trackingId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;outline:none;visibility:hidden;" />`;

  // Try to insert before </body> tag, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

/**
 * Mark an email as opened. Called by the tracking pixel endpoint.
 *
 * Bot/crawler/scanner requests are recorded (for debugging) but do NOT count
 * as real opens — `opened` is only set to true and `openCount` is only
 * incremented when a real email client loads the pixel.
 *
 * @param trackingId  The tracking record ID
 * @param userAgent   User-Agent header from the pixel request
 * @param ipAddress   Client IP from the pixel request
 */
export async function markEmailOpened(
  trackingId: string,
  userAgent?: string | null,
  ipAddress?: string | null
): Promise<void> {
  try {
    const isBot = isBotRequest(userAgent, ipAddress);

    if (isBot) {
      // Record the bot hit for debugging/analytics, but do NOT mark as opened
      // and do NOT increment openCount. Only increment botOpenCount.
      const botLabel = identifyBot(userAgent);
      console.log(`🤖 Bot open detected for ${trackingId} (${botLabel}) — not counted as real open`);

      await prisma.emailOpenTracking.update({
        where: { id: trackingId },
        data: {
          isBot: true,
          botOpenCount: { increment: 1 },
          userAgent: userAgent || null,
          ipAddress: ipAddress || null,
        },
      });
      return;
    }

    // Real email client open — mark as opened and increment openCount
    await prisma.emailOpenTracking.update({
      where: { id: trackingId },
      data: {
        opened: true,
        openedAt: new Date(),
        openCount: { increment: 1 },
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        isBot: false,
      },
    });
  } catch (error) {
    console.error('Failed to mark email as opened:', error);
  }
}

/**
 * Get open tracking stats for a single lead.
 * Returns array of tracking records for that lead.
 */
export async function getOpenStatsForLead(leadId: string) {
  try {
    return await prisma.emailOpenTracking.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Failed to get open stats for lead:', error);
    return [];
  }
}

/**
 * Batch fetch open tracking stats for multiple leads.
 * Returns a map of leadId -> { totalSent, totalOpened, openedStages[], lastOpenedAt }
 */
export async function getBatchOpenStats(
  leadIds: string[]
): Promise<Record<string, {
  totalSent: number;
  totalOpened: number;
  openedStages: string[];
  lastOpenedAt: Date | null;
}>> {
  if (!leadIds.length) return {};

  try {
    const records = await prisma.emailOpenTracking.findMany({
      where: { leadId: { in: leadIds } },
      select: {
        leadId: true,
        stage: true,
        opened: true,
        openedAt: true,
      },
    });

    const result: Record<string, {
      totalSent: number;
      totalOpened: number;
      openedStages: string[];
      lastOpenedAt: Date | null;
    }> = {};

    for (const rec of records) {
      if (!result[rec.leadId]) {
        result[rec.leadId] = {
          totalSent: 0,
          totalOpened: 0,
          openedStages: [],
          lastOpenedAt: null,
        };
      }
      result[rec.leadId].totalSent++;
      if (rec.opened) {
        result[rec.leadId].totalOpened++;
        if (rec.stage) {
          result[rec.leadId].openedStages.push(rec.stage);
        }
        const existingLast = result[rec.leadId]!.lastOpenedAt;
        if (rec.openedAt && (!existingLast || rec.openedAt > existingLast)) {
          result[rec.leadId]!.lastOpenedAt = rec.openedAt;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to batch fetch open stats:', error);
    return {};
  }
}
