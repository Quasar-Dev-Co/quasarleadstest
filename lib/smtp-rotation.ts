import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

export const SMTP_DAILY_LIMIT_PER_ACCOUNT = 100;

export type SmtpAccount = {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  dailyLimit?: number;
};

export type SelectedSmtpAccount = SmtpAccount & {
  index: number;
  transporter: nodemailer.Transporter;
  sentToday: number;
  remainingToday: number;
};

export type SmtpRotationResult =
  | { ok: true; account: SelectedSmtpAccount }
  | { ok: false; reason: 'all_exhausted' | 'all_failed' | 'no_accounts'; errors: string[] };

function getTodayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function normalizeSmtpAccount(raw: any): SmtpAccount {
  const parsedLimit = Number(raw?.dailyLimit);
  const dailyLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : undefined;
  return {
    SMTP_HOST: String(raw?.SMTP_HOST ?? raw?.host ?? '').trim(),
    SMTP_PORT: String(raw?.SMTP_PORT ?? raw?.port ?? '').trim(),
    SMTP_USER: String(raw?.SMTP_USER ?? raw?.user ?? '').trim(),
    SMTP_PASSWORD: String(raw?.SMTP_PASSWORD ?? raw?.password ?? '').trim(),
    dailyLimit,
  };
}

/**
 * Returns the effective daily send limit for an account.
 * Falls back to the default constant (100) when not configured.
 */
export function getAccountDailyLimit(account: SmtpAccount): number {
  return account.dailyLimit && account.dailyLimit > 0 ? account.dailyLimit : SMTP_DAILY_LIMIT_PER_ACCOUNT;
}

export function getConfiguredSmtpAccounts(credentials: Record<string, any>): SmtpAccount[] {
  const candidates: SmtpAccount[] = [];

  const legacy = normalizeSmtpAccount(credentials || {});
  candidates.push(legacy);

  const accounts = credentials?.SMTP_ACCOUNTS;
  if (Array.isArray(accounts)) {
    for (const account of accounts) {
      candidates.push(normalizeSmtpAccount(account));
    }
  }

  const unique = new Map<string, SmtpAccount>();

  for (const account of candidates) {
    const isComplete =
      !!account.SMTP_HOST &&
      !!account.SMTP_PORT &&
      !!account.SMTP_USER &&
      !!account.SMTP_PASSWORD;

    if (!isComplete) continue;

    const key = `${account.SMTP_HOST}|${account.SMTP_PORT}|${account.SMTP_USER}|${account.SMTP_PASSWORD}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, account);
    } else if (!existing.dailyLimit && account.dailyLimit) {
      // Prefer the entry that has an explicit dailyLimit set
      unique.set(key, account);
    }
  }

  return Array.from(unique.values());
}

async function getSentCountForAccount(
  userId: string,
  smtpUser: string,
  smtpHost: string,
  date: Date
): Promise<number> {
  const record = await prisma.smtpDailyUsage.findUnique({
    where: {
      userId_smtpUser_smtpHost_date: { userId, smtpUser, smtpHost, date },
    },
    select: { sentCount: true },
  });
  return record?.sentCount ?? 0;
}

export async function getDailyUsageForUser(userId: string): Promise<{
  accounts: Array<{ smtpUser: string; smtpHost: string; sentCount: number; date: Date; dailyLimit: number }>;
  totalSentToday: number;
  totalCapacity: number;
}> {
  const today = getTodayDate();
  const credentials = await getUserCredentials(userId);
  const configured = getConfiguredSmtpAccounts(credentials);

  const records = await prisma.smtpDailyUsage.findMany({
    where: { userId, date: today },
  });

  const usageMap = new Map<string, number>();
  for (const record of records) {
    const key = `${record.smtpHost}|${record.smtpUser}`;
    usageMap.set(key, record.sentCount);
  }

  const accounts = configured.map((account) => {
    const key = `${account.SMTP_HOST}|${account.SMTP_USER}`;
    const sentCount = usageMap.get(key) ?? 0;
    const dailyLimit = getAccountDailyLimit(account);
    return { smtpUser: account.SMTP_USER, smtpHost: account.SMTP_HOST, sentCount, date: today, dailyLimit };
  });

  const totalSentToday = accounts.reduce((sum, a) => sum + a.sentCount, 0);
  const totalCapacity = accounts.reduce((sum, a) => sum + a.dailyLimit, 0);

  return { accounts, totalSentToday, totalCapacity };
}

async function getUserCredentials(userId: string): Promise<Record<string, any>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credentials: true },
  });
  return (user?.credentials as Record<string, any>) || {};
}

export async function selectSmtpAccountForSending(userId: string): Promise<SmtpRotationResult> {
  const credentials = await getUserCredentials(userId);
  const configured = getConfiguredSmtpAccounts(credentials);

  if (configured.length === 0) {
    return { ok: false, reason: 'no_accounts', errors: ['No SMTP accounts configured'] };
  }

  const today = getTodayDate();
  const errors: string[] = [];

  for (let i = 0; i < configured.length; i++) {
    const account = configured[i];
    const accountLimit = getAccountDailyLimit(account);
    const sentToday = await getSentCountForAccount(userId, account.SMTP_USER, account.SMTP_HOST, today);

    if (sentToday >= accountLimit) {
      continue;
    }

    const portNumber = parseInt(account.SMTP_PORT, 10);
    if (!Number.isFinite(portNumber) || portNumber <= 0) {
      errors.push(`[SMTP ${i + 1}] invalid port: ${account.SMTP_PORT}`);
      continue;
    }

    const transporter = nodemailer.createTransport({
      host: account.SMTP_HOST,
      port: portNumber,
      secure: portNumber === 465,
      auth: {
        user: account.SMTP_USER,
        pass: account.SMTP_PASSWORD,
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 90000,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    } as any);

    try {
      await transporter.verify();
      const remainingToday = accountLimit - sentToday;

      if (i > 0) {
        console.warn(`⚠️ SMTP rotated to account #${i + 1} (${account.SMTP_USER}) for user ${userId} — previous accounts exhausted or failed`);
      }

      return {
        ok: true,
        account: {
          ...account,
          index: i,
          transporter,
          sentToday,
          remainingToday,
        },
      };
    } catch (error: any) {
      const message = error?.message || 'SMTP verification failed';
      errors.push(`[SMTP ${i + 1}] ${message}`);
    }
  }

  if (errors.length === 0) {
    return { ok: false, reason: 'all_exhausted', errors: ['All SMTP accounts have reached their daily limit'] };
  }

  return { ok: false, reason: 'all_failed', errors };
}

export async function incrementSmtpSentCount(
  userId: string,
  smtpUser: string,
  smtpHost: string
): Promise<void> {
  const today = getTodayDate();

  await prisma.smtpDailyUsage.upsert({
    where: {
      userId_smtpUser_smtpHost_date: { userId, smtpUser, smtpHost, date: today },
    },
    create: {
      userId,
      smtpUser,
      smtpHost,
      date: today,
      sentCount: 1,
      lastSentAt: new Date(),
    },
    update: {
      sentCount: { increment: 1 },
      lastSentAt: new Date(),
    },
  });
}

export async function selectSmtpAccountWithEnvFallback(userId?: string): Promise<
  | { ok: true; account: SelectedSmtpAccount; fromEnv: boolean }
  | { ok: false; reason: 'all_exhausted' | 'all_failed' | 'no_accounts' | 'no_env'; errors: string[] }
> {
  if (userId) {
    const result = await selectSmtpAccountForSending(userId);
    if (result.ok) {
      return { ok: true, account: result.account, fromEnv: false };
    }

    if (result.reason === 'all_exhausted') {
      return result;
    }
  }

  const envHost = process.env.SMTP_HOST;
  const envPort = process.env.SMTP_PORT;
  const envUser = process.env.SMTP_USER;
  const envPassword = process.env.SMTP_PASSWORD;

  if (!envHost || !envPort || !envUser || !envPassword) {
    if (userId) {
      return { ok: false, reason: 'all_failed', errors: ['No env SMTP fallback configured'] };
    }
    return { ok: false, reason: 'no_env', errors: ['No SMTP env credentials configured'] };
  }

  const portNumber = parseInt(envPort, 10);
  const transporter = nodemailer.createTransport({
    host: envHost,
    port: portNumber,
    secure: portNumber === 465,
    auth: { user: envUser, pass: envPassword },
  });

  try {
    await transporter.verify();
    return {
      ok: true,
      account: {
        SMTP_HOST: envHost,
        SMTP_PORT: envPort,
        SMTP_USER: envUser,
        SMTP_PASSWORD: envPassword,
        index: -1,
        transporter,
        sentToday: 0,
        remainingToday: Infinity,
      },
      fromEnv: true,
    };
  } catch (error: any) {
    return { ok: false, reason: 'all_failed', errors: [`Env SMTP failed: ${error?.message || 'verification failed'}`] };
  }
}
