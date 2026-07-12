import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BATCH_SIZE = 30;

interface CleanupJob {
  id: string;
  totalEmails: number;
  totalBatches: number;
  processedBatches: number;
  validEmails: string[];
  invalidEmails: string[];
  startTime: Date;
  status: 'running' | 'completed' | 'failed';
}

let activeCleanupJob: CleanupJob | null = null;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });
    const userApiKey = (user?.credentials as any)?.OPENAI_API_KEY;

    if (!userApiKey) {
      return NextResponse.json({ success: false, error: 'Missing OPENAI_API_KEY' }, { status: 400 });
    }

    if (!activeCleanupJob) {
      const totalEmails = await prisma.lead.count({
        where: { email: { notIn: ['', null] as any }, assignedTo: userId }
      });

      if (totalEmails === 0) {
        return NextResponse.json({ success: true, message: 'No emails', processed: 0 });
      }

      activeCleanupJob = {
        id: `cleanup_\${Date.now()}`,
        totalEmails,
        totalBatches: Math.ceil(totalEmails / BATCH_SIZE),
        processedBatches: 0,
        validEmails: [],
        invalidEmails: [],
        startTime: new Date(),
        status: 'running'
      };
    }

    if (activeCleanupJob && activeCleanupJob.status === 'running') {
      const result = await processNextBatch(activeCleanupJob, userApiKey, userId);
      if (result.completed) activeCleanupJob.status = 'completed';

      return NextResponse.json({
        success: true,
        jobId: activeCleanupJob.id,
        batchNumber: activeCleanupJob.processedBatches,
        totalBatches: activeCleanupJob.totalBatches,
        totalEmails: activeCleanupJob.totalEmails,
        completed: result.completed,
        processingTime: Date.now() - startTime
      });
    }

    return NextResponse.json({ success: true, message: 'No active job', processed: 0 });
  } catch (error: any) {
    if (activeCleanupJob) activeCleanupJob.status = 'failed';
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function processNextBatch(job: CleanupJob, userApiKey: string, userId: string) {
  const allLeads = await prisma.lead.findMany({
    where: { email: { notIn: ['', null] as any }, assignedTo: userId },
    select: { email: true }
  });
  const allEmails = allLeads.map(l => l.email).filter(Boolean);

  const startIndex = job.processedBatches * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, allEmails.length);
  const batchEmails = allEmails.slice(startIndex, endIndex);

  const { valid, invalid } = await validateEmailsWithOpenAI(batchEmails, userApiKey);

  job.validEmails.push(...valid);
  job.invalidEmails.push(...invalid);
  job.processedBatches++;

  if (invalid.length > 0) {
    await prisma.lead.deleteMany({
      where: { email: { in: invalid }, assignedTo: userId }
    });
  }

  return { completed: job.processedBatches >= job.totalBatches };
}

async function validateEmailsWithOpenAI(emails: string[], userApiKey: string): Promise<{ valid: string[], invalid: string[] }> {
  try {
    const prompt = `Validate these emails as business or invalid/spam. Return ONLY JSON: {"validEmails":[], "invalidEmails":[]}. Emails: \${emails.join(', ')}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer \${userApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });

    if (!response.ok) throw new Error('OpenAI error');
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    return { valid: emails, invalid: [] };
  }
}