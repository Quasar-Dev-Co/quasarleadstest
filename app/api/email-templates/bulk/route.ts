import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type IncomingTemplate = {
  stage: string;
  subject: string;
  // Old format
  htmlContent?: string;
  textContent?: string;
  // New modular format
  contentPrompt?: string;
  emailSignature?: string;
  mediaLinks?: string;
  // Common fields
  isActive?: boolean;
  variables?: string[];
  timing?: { delay: number; unit: 'minutes' | 'hours' | 'days'; description: string };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, templates } = body || {};

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }
    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json({ success: false, error: 'templates array is required' }, { status: 400 });
    }

    const results = {
      upsertedCount: 0,
      failedCount: 0
    };

    // Prisma doesn't have a direct equivalent to Mongoose's bulkWrite for upserts
    // So we loop through and upsert each template
    for (const t of templates as IncomingTemplate[]) {
      if (!t || !t.stage || !t.subject || !(t.htmlContent || t.contentPrompt)) {
        results.failedCount++;
        continue;
      }

      try {
        await prisma.emailTemplate.upsert({
          where: {
            stage_userId: {
              stage: t.stage,
              userId: userId
            }
          },
          update: {
            subject: t.subject,
            isActive: t.isActive !== undefined ? t.isActive : true,
            variables: Array.isArray(t.variables) ? t.variables : [],
            timing: (t.timing || { delay: 7, unit: 'days', description: 'Send after 7 days' }) as any,
            contentPrompt: t.contentPrompt || '',
            emailSignature: t.emailSignature || '',
            mediaLinks: t.mediaLinks || '',
            htmlContent: t.htmlContent || '',
            textContent: t.textContent || '',
            updatedAt: new Date()
          },
          create: {
            userId: userId,
            stage: t.stage,
            subject: t.subject,
            isActive: t.isActive !== undefined ? t.isActive : true,
            variables: Array.isArray(t.variables) ? t.variables : [],
            timing: (t.timing || { delay: 7, unit: 'days', description: 'Send after 7 days' }) as any,
            contentPrompt: t.contentPrompt || '',
            emailSignature: t.emailSignature || '',
            mediaLinks: t.mediaLinks || '',
            htmlContent: t.htmlContent || '',
            textContent: t.textContent || '',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        results.upsertedCount++;
      } catch (err) {
        console.error(`Failed to upsert template for stage \${t.stage}:`, err);
        results.failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Templates processed successfully',
      upserted: results.upsertedCount,
      failed: results.failedCount
    });
  } catch (error: any) {
    console.error('bulk import error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to import templates' }, { status: 500 });
  }
}
