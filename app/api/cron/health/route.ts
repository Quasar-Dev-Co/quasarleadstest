import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const triggerJobs = request.nextUrl.searchParams.get('trigger') === 'true';

    const stats = {
      total: await prisma.jobQueue.count(),
      pending: await prisma.jobQueue.count({ where: { status: 'pending' } }),
      running: await prisma.jobQueue.count({ where: { status: 'running' } }),
      completed: await prisma.jobQueue.count({ where: { status: 'completed' } }),
      failed: await prisma.jobQueue.count({ where: { status: 'failed' } })
    };

    const recentJobs = await prisma.jobQueue.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        jobId: true, status: true, services: true, locations: true, progress: true,
        progressMessage: true, createdAt: true, startedAt: true, completedAt: true
      }
    });

    const healthData: any = {
      success: true,
      timestamp: new Date().toISOString(),
      database: 'connected',
      jobStats: stats,
      recentJobs
    };

    if (triggerJobs && stats.pending > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const triggerResponse = await fetch(`${appUrl}/api/cron/process-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {})
        }
      });
      healthData.jobTriggerResult = { success: triggerResponse.ok };
    }

    return NextResponse.json(healthData);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const headers: Record<string, string> = { 'user-agent': 'Vercel-Cron' };
    if (process.env.CRON_SECRET) {
      headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    }

    const triggerResponse = await fetch(`${appUrl}/api/cron/process-jobs`, {
      method: 'GET',
      headers
    });
    const data = await triggerResponse.json();
    return NextResponse.json({ success: true, testResult: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}