import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getUserLeadScope(userId: string) {
  return {
    OR: [{ leadsCreatedBy: userId }, { assignedTo: userId }],
  };
}

export async function POST(request: NextRequest) {
  console.log('🧹 Invalid-status Email Cleanup started at:', new Date().toISOString());

  try {
    // Identify current user from Authorization header: Bearer <userId>
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ')
      ? authHeader.substring('Bearer '.length).trim()
      : '';

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'AUTH_REQUIRED', message: 'Please sign in to clean emails.' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const isCronJob = searchParams.get('cron') === 'true';
    const batchNumber = parseInt(searchParams.get('batch') || '0');

    if (isCronJob) {
      // Cronjob mode - process next batch
      return await processCronJobBatch(userId, batchNumber);
    } else {
      // Manual mode - process all emails immediately
      return await processAllEmails(userId);
    }

  } catch (error) {
    console.error('❌ Email cleanup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processed: 0,
        valid: 0,
        invalid: 0
      },
      { status: 500 }
    );
  }
}

async function processAllEmails(userId: string) {
  const startTime = Date.now();

  const totalLeadsWithEmail = await prisma.lead.count({
    where: {
      ...getUserLeadScope(userId),
      email: { not: '' },
    },
  });

  const invalidLeadCount = await prisma.lead.count({
    where: {
      ...getUserLeadScope(userId),
      emailValidationStatus: 'invalid',
    },
  });

  let deleted = 0;
  if (invalidLeadCount > 0) {
    const result = await prisma.lead.deleteMany({
      where: {
        ...getUserLeadScope(userId),
        emailValidationStatus: 'invalid',
      },
    });
    deleted = result.count;
  }

  const processingTime = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    message: `Invalid email cleanup completed in ${processingTime}ms`,
    processed: totalLeadsWithEmail,
    valid: Math.max(0, totalLeadsWithEmail - deleted),
    invalid: deleted,
    deleted,
    existingInvalidDeleted: deleted,
    newlyDetectedDeleted: 0,
    processingTime,
  });
}

async function processCronJobBatch(userId: string, batchNumber: number) {
  const startTime = Date.now();
  console.log(`🔄 Processing strict invalid-status cleanup batch ${batchNumber} for user ${userId}...`);

  const totalLeadsWithEmail = await prisma.lead.count({
    where: {
      ...getUserLeadScope(userId),
      email: { not: '' },
    },
  });

  const deleteResult = await prisma.lead.deleteMany({
    where: {
      ...getUserLeadScope(userId),
      emailValidationStatus: 'invalid',
    },
  });

  const deletedCount = deleteResult.count;
  const processingTime = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    message: 'Strict invalid-status cleanup completed',
    batchNumber: batchNumber + 1,
    totalBatches: 1,
    processed: totalLeadsWithEmail,
    valid: Math.max(0, totalLeadsWithEmail - deletedCount),
    invalid: deletedCount,
    deleted: deletedCount,
    processingTime,
    completed: true,
  });
}

export async function GET(request: NextRequest) {
  try {
    const totalLeads = await prisma.lead.count({
      where: {
        email: { not: '' }
      }
    });

    const distinctEmails = await prisma.lead.groupBy({
      by: ['email'],
      where: {
        email: { not: '' }
      }
    });

    return NextResponse.json({
      success: true,
      totalLeads,
      totalEmails: distinctEmails.length,
      readyForCleanup: distinctEmails.length > 0
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to get cleanup status' },
      { status: 500 }
    );
  }
} 