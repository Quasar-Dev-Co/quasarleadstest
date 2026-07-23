import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

type ImapAccountConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

function getConfiguredImapAccounts(creds: Record<string, any>): ImapAccountConfig[] {
  const candidates: ImapAccountConfig[] = [];

  const legacyHost = String(creds.IMAP_HOST ?? '').trim();
  const legacyPort = String(creds.IMAP_PORT ?? '').trim();
  const legacyUser = String(creds.IMAP_USER ?? '').trim();
  const legacyPassword = String(creds.IMAP_PASSWORD ?? '').trim();

  if (legacyHost && legacyPort && legacyUser && legacyPassword) {
    candidates.push({
      host: legacyHost,
      port: parseInt(legacyPort, 10) || 993,
      user: legacyUser,
      password: legacyPassword,
    });
  }

  if (Array.isArray(creds.IMAP_ACCOUNTS)) {
    for (const account of creds.IMAP_ACCOUNTS) {
      if (!account || typeof account !== 'object') continue;
      const host = String(account.IMAP_HOST ?? account.host ?? '').trim();
      const port = String(account.IMAP_PORT ?? account.port ?? '').trim();
      const user = String(account.IMAP_USER ?? account.user ?? '').trim();
      const password = String(account.IMAP_PASSWORD ?? account.password ?? '').trim();

      if (host && port && user && password) {
        candidates.push({
          host,
          port: parseInt(port, 10) || 993,
          user,
          password,
        });
      }
    }
  }

  const unique = new Map<string, ImapAccountConfig>();
  for (const account of candidates) {
    const key = `${account.host}|${account.port}|${account.user}|${account.password}`;
    if (!unique.has(key)) {
      unique.set(key, account);
    }
  }

  return Array.from(unique.values());
}

function hasAnyImapConfigured(creds: Record<string, any>): boolean {
  return getConfiguredImapAccounts(creds).length > 0;
}

// Sender patterns that indicate automated/bounce/system emails, not real lead replies.
const BLOCKED_SENDER_PATTERNS = [
  'mailer-daemon',
  'mailerdaemon',
  'postmaster',
  'no-reply',
  'noreply',
  'donotreply',
  'do-not-reply',
  'auto-reply',
  'autoreply',
  'bounces',
  'bounce@',
  'mailbot',
  'bot@',
  'notification@',
  'alerts@',
  'noreply@',
  'mailer@',
  'dmarc',
  'feedback@',
  'abuse@',
  'spam@',
];

function isBlockedSender(email: string): boolean {
  const lower = email.toLowerCase();
  return BLOCKED_SENDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Vercel Cron Job: Fetches incoming emails via IMAP for ALL users with IMAP credentials.
 * Reads from ALL configured IMAP accounts per user (multi-IMAP support).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('📬 Multi-User Cron Job: Starting incoming email fetch for all users...');

  const allUsers = await prisma.user.findMany();
  const users = allUsers.filter(user => {
    const creds = (user.credentials as any) || {};
    return hasAnyImapConfigured(creds);
  });

  if (users.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No users found with complete IMAP credentials',
      usersProcessed: 0
    });
  }

  console.log(`📧 Found ${users.length} users with IMAP credentials`);

  let totalProcessed = 0;
  let totalNewEmails = 0;
  const userResults: any[] = [];

  for (const user of users) {
    console.log(`\n🔄 Processing emails for user: ${user.email} (${user.id})`);

    const result = await processUserEmails(user);
    userResults.push(result);
    totalProcessed += result.processed;
    totalNewEmails += result.newEmails;
  }

  return NextResponse.json({
    success: true,
    message: `Multi-user email fetch completed`,
    summary: {
      usersProcessed: users.length,
      totalEmailsProcessed: totalProcessed,
      totalNewEmails: totalNewEmails
    },
    userResults: userResults
  });
}

/**
 * Process emails for a single user across ALL their IMAP accounts
 */
async function processUserEmails(user: any): Promise<{ userId: string; email: string; processed: number; newEmails: number; error?: string }> {
  const userId = user.id;
  const userEmail = user.email;

  try {
    const creds = (user.credentials as any) || {};
    const imapAccounts = getConfiguredImapAccounts(creds);

    if (imapAccounts.length === 0) {
      return { userId, email: userEmail, processed: 0, newEmails: 0, error: 'No IMAP accounts configured' };
    }

    console.log(`📬 User ${userEmail} has ${imapAccounts.length} IMAP account(s) to check`);

    let totalProcessed = 0;
    let totalNewEmails = 0;
    const accountErrors: string[] = [];

    for (let i = 0; i < imapAccounts.length; i++) {
      const imapConfig = imapAccounts[i];
      const label = `${imapConfig.host}:${imapConfig.port} (${imapConfig.user})`;

      console.log(`🔗 [IMAP ${i + 1}/${imapAccounts.length}] Connecting to ${label} for user: ${userEmail}...`);

      try {
        const result = await processSingleImapAccount(userId, userEmail, imapConfig, i + 1, creds);
        totalProcessed += result.processed;
        totalNewEmails += result.newEmails;
      } catch (err: any) {
        console.error(`❌ [IMAP ${i + 1}] Failed for ${userEmail} on ${label}: ${err.message}`);
        accountErrors.push(`[IMAP ${i + 1}] ${label}: ${err.message}`);
      }
    }

    return {
      userId,
      email: userEmail,
      processed: totalProcessed,
      newEmails: totalNewEmails,
      error: accountErrors.length > 0 ? accountErrors.join(' | ') : undefined,
    };
  } catch (err: any) {
    console.error(`❌ Failed to fetch emails for user ${userEmail}:`, err.message);
    return {
      userId,
      email: userEmail,
      processed: 0,
      newEmails: 0,
      error: err.message
    };
  }
}

/**
 * Process a single IMAP account for a user
 */
async function processSingleImapAccount(
  userId: string,
  userEmail: string,
  imapConfig: ImapAccountConfig,
  accountIndex: number,
  userCredentials: Record<string, any> = {}
): Promise<{ processed: number; newEmails: number }> {
  const label = `${imapConfig.host}:${imapConfig.port}`;
  let client: ImapFlow | null = null;
  let processedCount = 0;
  let newEmailsCount = 0;

  client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: imapConfig.port === 993,
    auth: {
      user: imapConfig.user,
      pass: imapConfig.password,
    },
    logger: false as const,
  });

  try {
    await client.connect();
    console.log(`✅ [IMAP ${accountIndex}] Connected to ${label} for user: ${userEmail}`);
  } catch (connectError: any) {
    throw new Error(`IMAP connection failed: ${connectError.message}`);
  }

  let lock;
  try {
    lock = await client.getMailboxLock('INBOX');
    console.log(`📫 [IMAP ${accountIndex}] Opened INBOX for ${userEmail} on ${label}`);
  } catch (lockError: any) {
    throw new Error(`Failed to open INBOX: ${lockError.message}`);
  }

  try {
    console.log(`📥 [IMAP ${accountIndex}] Scanning INBOX for ${userEmail} on ${label}...`);

    const now = new Date();
    // Use a 30-minute lookback window to avoid missing replies when the cron
    // runs late or IMAP fetch takes time. Deduplication via messageId in the
    // incoming route prevents double-processing.
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 30);

    const totalMessages = typeof client.mailbox === 'object' && client.mailbox && 'exists' in client.mailbox
      ? Number((client.mailbox as any).exists || 0)
      : 0;
    const lastN = 200;
    const startSeq = Math.max(1, totalMessages - lastN + 1);
    const seqRange = `${startSeq}:*`;

    for await (const msg of client.fetch(seqRange, { uid: true, source: true, envelope: true, flags: true })) {
      processedCount++;

      const parsed = await simpleParser((msg as any).source);

      const fromEmail = (() => {
        const envFrom = (msg as any)?.envelope?.from?.[0];
        if (envFrom?.address) return envFrom.address as string;
        const from = parsed.from as any;
        if (!from) return 'unknown';
        if (Array.isArray(from)) {
          return (from[0] as any)?.address || 'unknown';
        }
        return (from as any).address || from.text || 'unknown';
      })();

      const ownDomains = ['quasarseo.nl', 'testqlagain.vercel.app'];
      // Also include the current user's own sending domains (from SMTP accounts)
      const smtpAccounts = userCredentials.SMTP_ACCOUNTS || [];
      if (Array.isArray(smtpAccounts)) {
        for (const acc of smtpAccounts) {
          const smtpUser = String(acc?.SMTP_USER || acc?.user || '').trim();
          if (smtpUser.includes('@')) {
            const domain = smtpUser.split('@')[1]?.toLowerCase();
            if (domain && !ownDomains.includes(domain)) ownDomains.push(domain);
          }
        }
      }
      const legacySmtpUser = String(userCredentials.SMTP_USER || '').trim();
      if (legacySmtpUser.includes('@')) {
        const domain = legacySmtpUser.split('@')[1]?.toLowerCase();
        if (domain && !ownDomains.includes(domain)) ownDomains.push(domain);
      }
      const userEmailDomain = userEmail.split('@')[1]?.toLowerCase();
      if (userEmailDomain && !ownDomains.includes(userEmailDomain)) ownDomains.push(userEmailDomain);

      const fromDomain = fromEmail.split('@')[1]?.toLowerCase();
      if (fromDomain && ownDomains.includes(fromDomain)) {
        continue;
      }

      // Skip automated/bounce/system emails that aren't real lead replies.
      if (isBlockedSender(fromEmail)) {
        continue;
      }

      const hasRefs = Boolean(parsed.inReplyTo || parsed.references);
      const subjRe = (parsed.subject || '').toLowerCase().startsWith('re:');
      const isReply = hasRefs || subjRe;

      if (!isReply) continue;

      const rawDate: any = (msg as any)?.envelope?.date || parsed.date;
      if (!rawDate) continue;
      const emailDate = new Date(rawDate);
      const isRecent = emailDate >= tenMinutesAgo && emailDate <= now;

      if (!isRecent) continue;

      const existingEmail = await prisma.incomingEmail.findFirst({
        where: {
          metadata: {
            path: ['messageId'],
            equals: parsed.messageId
          }
        }
      });

      if (existingEmail) continue;

      const emailSubject = parsed.subject || 'No Subject';
      const emailContent = parsed.text || parsed.html || '';

      if (!emailContent.trim()) continue;

      const threadId = parsed.inReplyTo || parsed.messageId || `thread-${Date.now()}-${Math.random()}`;

      const toAddress = (() => {
        const envTo = (msg as any)?.envelope?.to?.[0];
        if (envTo?.address) return envTo.address as string;
        const to = parsed.to as any;
        if (!to) return '';
        if (Array.isArray(to)) {
          return (to[0] as any)?.address || '';
        }
        return (to as any).address || to.text || '';
      })();

      const emailPayload = {
        userId: userId,
        leadEmail: fromEmail,
        subject: emailSubject,
        content: emailContent,
        htmlContent: parsed.html || '',
        fromAddress: fromEmail,
        toAddress: toAddress,
        messageId: parsed.messageId || '',
        inReplyTo: parsed.inReplyTo || '',
        references: parsed.references || '',
        isReply: isReply,
        isRecent: isRecent,
        threadId: threadId
      };

      // Resolve the internal API URL — must be publicly reachable on Vercel.
      // Skip localhost env values (they don't work on Vercel serverless).
      const internalBaseUrl = (() => {
        const candidates = [
          process.env.NEXT_PUBLIC_APP_URL,
          process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
          process.env.APP_BASE_URL,
        ];
        for (const c of candidates) {
          if (!c) continue;
          const v = c.trim().replace(/\/$/, '');
          if (!v) continue;
          if (v.includes('localhost') || v.includes('127.0.0.1')) continue;
          return v;
        }
        return 'http://localhost:3000';
      })();

      const saveResponse = await fetch(`${internalBaseUrl}/api/email-responses/incoming`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload)
      });

      if (saveResponse.ok) {
        const saveResult = await saveResponse.json();
        if (saveResult.success) {
          newEmailsCount++;
        }
      }
    }

  } finally {
    if (lock) {
      lock.release();
    }
  }

  if (client && client.usable) {
    await client.logout();
  }

  console.log(`✅ [IMAP ${accountIndex}] Done for ${label}: ${processedCount} processed, ${newEmailsCount} new`);

  return { processed: processedCount, newEmails: newEmailsCount };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}