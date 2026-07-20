import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfiguredSmtpAccounts, getAccountDailyLimit, SMTP_DAILY_LIMIT_PER_ACCOUNT } from '@/lib/smtp-rotation';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credentials: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const credentials = (user.credentials as Record<string, any>) || {};
    const configuredSmtpAccounts = getConfiguredSmtpAccounts(credentials);
    const configuredAccountCount = configuredSmtpAccounts.length;
    // Use per-account limits (sum of each account's configured dailyLimit, default 100)
    const dailyCapacity = configuredSmtpAccounts.reduce((sum, acc) => sum + getAccountDailyLimit(acc), 0);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const usageRecords = await prisma.smtpDailyUsage.findMany({
      where: { userId, date: today },
    });

    const usageMap = new Map<string, number>();
    for (const record of usageRecords) {
      const key = `${record.smtpHost}|${record.smtpUser}`;
      usageMap.set(key, record.sentCount);
    }

    const perAccount = configuredSmtpAccounts.map((account, index) => {
      const key = `${account.SMTP_HOST}|${account.SMTP_USER}`;
      const sentCount = usageMap.get(key) ?? 0;
      const accountLimit = getAccountDailyLimit(account);
      return {
        index: index + 1,
        smtpUser: account.SMTP_USER,
        smtpHost: account.SMTP_HOST,
        sentCount,
        remaining: Math.max(accountLimit - sentCount, 0),
        limit: accountLimit,
      };
    });

    const sentToday = perAccount.reduce((sum, a) => sum + a.sentCount, 0);
    const remainingToday = Math.max(dailyCapacity - sentToday, 0);

    return NextResponse.json({
      success: true,
      data: {
        dailyLimitPerAccount: SMTP_DAILY_LIMIT_PER_ACCOUNT, // default, kept for backward compat
        configuredAccountCount,
        dailyCapacity,
        sentToday,
        remainingToday,
        perAccount,
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching SMTP daily capacity:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch SMTP daily capacity' },
      { status: 500 }
    );
  }
}
