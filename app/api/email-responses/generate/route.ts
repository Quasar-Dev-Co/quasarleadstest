import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import {
  appendEnvKey,
  getApiKeysFromCredentials,
} from '@/lib/api-key-rotation';

const EMAIL_RESPONSE_MODEL = 'gpt-5.4-nano';

/**
 * POST: Generates an AI response for an incoming email.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization') || '';
    const bearerUserId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    const { incomingEmailId } = body;

    if (!incomingEmailId) {
      return NextResponse.json({ success: false, error: 'Incoming email ID is required' }, { status: 400 });
    }

    const incomingEmail = await prisma.incomingEmail.findUnique({ where: { id: incomingEmailId } });
    if (!incomingEmail) {
      return NextResponse.json({ success: false, error: 'Incoming email not found' }, { status: 404 });
    }

    const userId = bearerUserId || incomingEmail.userId;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID not found' }, { status: 400 });
    }

    const aiSettings = await prisma.aISettings.findUnique({ where: { userId } });
    if (!aiSettings) {
      return NextResponse.json({ success: false, error: 'AI settings not found. Please configure them first.' }, { status: 404 });
    }

    const existingResponse = await prisma.aIResponse.findFirst({
      where: { incomingEmailId, status: { not: 'failed' } },
      orderBy: { createdAt: 'desc' }
    });

    if (existingResponse) {
      return NextResponse.json({
        success: true,
        response: {
          id: existingResponse.id,
          incomingEmailId: existingResponse.incomingEmailId,
          generatedSubject: existingResponse.generatedSubject,
          generatedContent: existingResponse.generatedContent,
          reasoning: existingResponse.reasoning,
          status: existingResponse.status,
          createdAt: existingResponse.createdAt,
          responseType: existingResponse.responseType
        },
        message: 'AI response already exists'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });

    const openAiKey = appendEnvKey(
      getApiKeysFromCredentials((user?.credentials as Record<string, any>) || {}, 'OPENAI_API_KEY', 'OPENAI_ACCOUNTS'),
      process.env.OPENAI_API_KEY
    )[0] || '';

    const aiResult = await generateAIResponse(incomingEmail, aiSettings, openAiKey);
    if (aiResult.isDropped) {
      return NextResponse.json({ success: false, error: aiResult.reasoning }, { status: 400 });
    }

    const newAIResponse = await prisma.aIResponse.create({
      data: {
        incomingEmailId: incomingEmailId,
        generatedSubject: aiResult.subject,
        generatedContent: aiResult.content,
        status: 'sending',
        responseType: 'ai_generated',
        reasoning: aiResult.reasoning,
        userId: userId,
      }
    });

    return NextResponse.json({
      success: true,
      response: {
        id: newAIResponse.id,
        incomingEmailId: newAIResponse.incomingEmailId,
        generatedSubject: newAIResponse.generatedSubject,
        generatedContent: newAIResponse.generatedContent,
        reasoning: newAIResponse.reasoning,
        status: newAIResponse.status,
        createdAt: newAIResponse.createdAt,
        responseType: newAIResponse.responseType
      },
      message: 'AI response generated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error generating AI response:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to generate AI response' }, { status: 500 });
  }
}

async function generateAIResponse(email: any, aiSettings: any, openAiKey: string): Promise<{ subject: string; content: string; isDropped: boolean; reasoning: string; }> {
  if (!openAiKey) return { isDropped: true, subject: '', content: '', reasoning: 'OpenAI API key missing.' };
  if (!aiSettings?.responsePrompt) return { isDropped: true, subject: '', content: '', reasoning: 'No AI prompt found in settings.' };

  const systemPrompt = `${aiSettings.responsePrompt}\n\n${aiSettings.customInstructions || ''}\n\nYou must follow the user's exact persona and tone. Never include placeholders like [your name], [phone], [email], etc.`.trim();
  const signatureRaw: string = aiSettings.signature || '';
  const formattedSignature = signatureRaw ? `\n<br/><br/>\n<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e0e0e0;">${signatureRaw.replace(/\n/g, '<br/>')}</div>` : '';

  const userPrompt = `Respondent: ${email.leadName} (${email.leadEmail})\nSubject: ${email.subject}\nContent:\n---\n${email.content}\n---`;

  try {
    const openai = new OpenAI({ apiKey: openAiKey });

    let aiContent = '';

    try {
      const response = await openai.responses.create({
        model: EMAIL_RESPONSE_MODEL,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_output_tokens: 900,
        store: false,
      });

      aiContent = String((response as any)?.output_text || '').trim();

      if (!aiContent) {
        const output = (response as any)?.output;
        if (Array.isArray(output)) {
          for (const item of output) {
            const contentItems = item?.content;
            if (!Array.isArray(contentItems)) continue;
            for (const contentItem of contentItems) {
              if (contentItem?.type === 'output_text' && typeof contentItem?.text === 'string' && contentItem.text.trim()) {
                aiContent = contentItem.text.trim();
                break;
              }
            }
            if (aiContent) break;
          }
        }
      }
    } catch {}

    if (!aiContent) {
      const completion = await openai.chat.completions.create({
        model: EMAIL_RESPONSE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      aiContent = completion.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!aiContent) return { isDropped: true, subject: '', content: '', reasoning: 'Empty AI response' };

    const subject = `Re: ${email.subject}`;
    let cleanedContent = aiContent;
    const signOffPatterns = [/Best regards,?\\s*[\\s\\S]*$/i, /Sincerely,?\\s*[\\s\\S]*$/i, /Kind regards,?\\s*[\\s\\S]*$/i, /Thank you,?\\s*[\\s\\S]*$/i];
    signOffPatterns.forEach(pattern => { cleanedContent = cleanedContent.replace(pattern, '').trim(); });
    const content = cleanedContent + formattedSignature;

    return { isDropped: false, subject, content, reasoning: 'Generated successfully' };
  } catch (error: any) {
    return { isDropped: true, subject: '', content: '', reasoning: error.message };
  }
}