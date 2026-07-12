import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Fetch all email templates for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required to fetch email templates'
      }, { status: 400 });
    }

    const templates = await prisma.emailTemplate.findMany({
      where: { userId },
      orderBy: { stage: 'asc' }
    });

    const cleanTemplates = templates.map((template) => ({
      id: template.id,
      stage: template.stage,
      subject: template.subject,
      contentPrompt: template.contentPrompt || '',
      emailSignature: template.emailSignature || '',
      mediaLinks: template.mediaLinks || '',
      htmlContent: template.htmlContent,
      textContent: template.textContent,
      isActive: template.isActive,
      variables: template.variables,
      timing: template.timing,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString()
    }));

    console.log(`📧 Retrieved \${cleanTemplates.length} email templates for user \${userId}`);

    return NextResponse.json({
      success: true,
      templates: cleanTemplates
    });

  } catch (error: any) {
    console.error('❌ Error fetching email templates:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch email templates'
    }, { status: 500 });
  }
}

// POST - Save/Update email template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      stage,
      subject,
      contentPrompt,
      emailSignature,
      mediaLinks,
      htmlContent,
      textContent,
      isActive,
      variables,
      timing,
      userId
    } = body;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required to save email template'
      }, { status: 400 });
    }

    if (!stage || !subject) {
      return NextResponse.json({
        success: false,
        error: 'Stage and subject are required'
      }, { status: 400 });
    }

    if (!contentPrompt && !htmlContent) {
      return NextResponse.json({
        success: false,
        error: 'Either contentPrompt (new system) or htmlContent (legacy) is required'
      }, { status: 400 });
    }

    console.log(`💾 SAVING TEMPLATE - Stage: \${stage}, userId: \${userId}`);

    const result = await prisma.emailTemplate.upsert({
      where: {
        stage_userId: {
          stage: stage,
          userId: userId
        }
      },
      update: {
        subject,
        contentPrompt: contentPrompt || '',
        emailSignature: emailSignature || '',
        mediaLinks: mediaLinks || '',
        htmlContent: htmlContent || '',
        textContent: textContent || '',
        isActive: isActive !== undefined ? isActive : true,
        variables: variables || [],
        timing: (timing || { delay: 7, unit: 'days', description: 'Send after 7 days' }) as any,
        updatedAt: new Date()
      },
      create: {
        userId,
        stage,
        subject,
        contentPrompt: contentPrompt || '',
        emailSignature: emailSignature || '',
        mediaLinks: mediaLinks || '',
        htmlContent: htmlContent || '',
        textContent: textContent || '',
        isActive: isActive !== undefined ? isActive : true,
        variables: variables || [],
        timing: (timing || { delay: 7, unit: 'days', description: 'Send after 7 days' }) as any,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: `Email template for \${stage} saved successfully`,
      template: {
        id: result.id,
        stage: result.stage,
        subject: result.subject,
        htmlContent: result.htmlContent,
        textContent: result.textContent,
        isActive: result.isActive,
        variables: result.variables,
        timing: result.timing,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error saving email template:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to save email template'
    }, { status: 500 });
  }
}

// PUT - Update specific template (by ID or stage)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, stage, subject, htmlContent, textContent, isActive, variables, timing, userId } = body;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required to update email template'
      }, { status: 400 });
    }

    if (!id && !stage) {
      return NextResponse.json({
        success: false,
        error: 'Template ID or stage is required'
      }, { status: 400 });
    }

    const updateData: any = {};
    if (subject) updateData.subject = subject;
    if (htmlContent) updateData.htmlContent = htmlContent;
    if (textContent !== undefined) updateData.textContent = textContent;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (variables) updateData.variables = variables;
    if (timing) updateData.timing = timing;
    updateData.updatedAt = new Date();

    let result;
    if (id) {
      result = await prisma.emailTemplate.update({
        where: { id: id, userId: userId },
        data: updateData
      });
    } else {
      result = await prisma.emailTemplate.update({
        where: { stage_userId: { stage: stage, userId: userId } },
        data: updateData
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Email template updated successfully',
      template: {
        id: result.id,
        stage: result.stage,
        subject: result.subject,
        htmlContent: result.htmlContent,
        textContent: result.textContent,
        isActive: result.isActive,
        variables: result.variables,
        timing: result.timing,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error updating email template:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update email template'
    }, { status: 500 });
  }
}

// DELETE - Delete email template
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required to delete email template'
      }, { status: 400 });
    }

    if (!stage && !id) {
      // Delete ALL templates for this user
      const result = await prisma.emailTemplate.deleteMany({
        where: { userId: userId }
      });

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.count} email template(s) successfully`,
        deletedCount: result.count
      });
    }

    if (id) {
      await prisma.emailTemplate.delete({
        where: { id: id, userId: userId }
      });
    } else if (stage) {
      await prisma.emailTemplate.delete({
        where: { stage_userId: { stage: stage, userId: userId } }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Email template deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting email template:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete email template'
    }, { status: 500 });
  }
} 