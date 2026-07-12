import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';
import {
  appendEnvKey,
  getApiKeysFromCredentials,
} from '@/lib/api-key-rotation';

/**
 * Generates an AI-powered response using OpenAI and the latest settings from database.
 */
async function generateAIResponse(email: any, aiSettings: any, apiKey: string): Promise<{ subject: string; content: string; isDropped: boolean; reasoning: string; }> {
  if (!apiKey) {
    return { isDropped: true, subject: '', content: '', reasoning: 'OPENAI_API_KEY is missing.' };
  }

  if (!aiSettings?.responsePrompt) {
    return {
      isDropped: true,
      subject: '',
      content: '',
      reasoning: 'No AI prompt found in settings. Please configure the prompt in the frontend.'
    };
  }

  const basePrompt: string = aiSettings.responsePrompt || '';
  const extraDirectives = `
You must follow the user's exact persona and tone. Never include placeholders like [your name], [phone], [email], etc. Do not add brackets around variables. Keep the response concise and human.
`;
  const systemPrompt = `${basePrompt}\n\n${aiSettings.customInstructions || ''}\n\n${extraDirectives}`.trim();

  const signatureRaw: string = aiSettings.signature || '';
  const formattedSignature = signatureRaw ? `
<br/><br/>
<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-family: Arial, sans-serif;">
${signatureRaw.replace(/\n/g, '<br/>')}
</div>
` : '';

  const userPrompt = `Here is the email you need to respond to using the configured instructions.

RESPONSE REQUIREMENTS:
1) Do NOT use any placeholders. Never write strings like [name], [phone], [email], etc.
2) Do NOT include any signature or sign-off in your response - the signature will be added automatically
3) Keep the body warm and professional. No sales pressure. Keep paragraphs short.
4) End your response after the main content - do not add "Best regards", "Sincerely", etc.

FROM: ${email.leadName} (${email.leadEmail})
SUBJECT: ${email.subject}
CONTENT:
---
${email.content}
---

Respond according to the configured instructions. Output HTML for any formatting you include.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: aiSettings?.maxResponseLength || 400,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`OpenAI API returned status ${response.status}`);
    }

    let aiContent = data.choices?.[0]?.message?.content?.trim();

    if (!aiContent) {
      return { isDropped: true, subject: '', content: '', reasoning: 'OpenAI response was empty.' };
    }

    const subject = `Re: ${email.subject}`;
    let cleanedContent = aiContent;

    const signOffPatterns = [
      /Best regards,?\s*[\s\S]*$/i,
      /Sincerely,?\s*[\s\S]*$/i,
      /Kind regards,?\s*[\s\S]*$/i,
      /Thank you,?\s*[\s\S]*$/i,
      /Greetings,?\s*[\s\S]*$/i,
    ];

    signOffPatterns.forEach(pattern => {
      cleanedContent = cleanedContent.replace(pattern, '').trim();
    });

    const content = cleanedContent + formattedSignature;

    if (!content || content.length < 20) {
      return { isDropped: true, subject: '', content: '', reasoning: 'AI content was too short or missing.' };
    }

    return {
      isDropped: false,
      subject,
      content,
      reasoning: 'Successfully generated using your configured prompt.'
    };

  } catch (error: any) {
    console.error(`❌ Error calling OpenAI API:`, error.message);
    return { isDropped: true, subject: '', content: '', reasoning: `OpenAI API error: ${error.message}` };
  }
}

/**
 * Saves Dutch final template as DRAFT
 */
async function saveDutchTemplateAsDraft(email: any, userId: string, aiSettings: any): Promise<boolean> {
  try {
    const companyName = aiSettings?.companyName || 'QuasarSEO';
    const subject = `Re: ${email.subject}`;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Afspraak Boeken - ${companyName}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 15px 15px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 300;">Hallo ${email.leadName}! 👋</h1>
    </div>
    <div style="background: white; padding: 40px; border-radius: 0 0 15px 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        <p style="font-size: 18px; color: #2c3e50; margin-bottom: 25px;"><strong>Dank je wel voor je blijvende interesse en vragen!</strong> 🙏</p>
        <p style="font-size: 16px; margin-bottom: 20px; color: #34495e;">Ik waardeer het enorm dat je de tijd hebt genomen om meerdere keren contact op te nemen.</p>
        <div style="text-align: center; margin: 35px 0;">
            <a href="https://booking.quasarleads.com/68ae0964c18b63a4c450be71" style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600;">📅 Boek nu je gratis consultatiegesprek!</a>
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ecf0f1; text-align: center;">
            <p style="margin: 0; color: #667eea; font-weight: 600;">Met vriendelijke groet,<br><span style="color: #2c3e50;">Team ${companyName}</span></p>
        </div>
    </div>
</body>
</html>`;

    await prisma.aIResponse.create({
      data: {
        incomingEmailId: email.id,
        generatedSubject: subject,
        generatedContent: htmlContent,
        status: 'draft',
        responseType: 'final_template',
        reasoning: `Beautiful Dutch final template for 3rd+ reply`,
        userId: userId,
        autoGenerated: true
      }
    });

    await prisma.incomingEmail.update({
      where: { id: email.id },
      data: {
        status: 'pending_ai',
        processedAt: new Date()
      }
    });

    return true;
  } catch (error: any) {
    console.error(`❌ Error in saveDutchTemplateAsDraft:`, error.message);
    return false;
  }
}

/**
 * Saves AI response as DRAFT
 */
async function saveAsDraft(email: any, reply: { subject: string, content: string }, reasoning: string, userId?: string): Promise<boolean> {
  try {
    if (!userId) return false;

    await prisma.aIResponse.create({
      data: {
        incomingEmailId: email.id,
        generatedSubject: reply.subject,
        generatedContent: reply.content,
        status: 'draft',
        responseType: 'ai_generated',
        reasoning: reasoning,
        userId: userId,
        autoGenerated: true
      }
    });

    await prisma.incomingEmail.update({
      where: { id: email.id },
      data: {
        status: 'pending_ai',
        processedAt: new Date()
      }
    });

    return true;
  } catch (error: any) {
    console.error(`❌ Error in saveAsDraft:`, error.message);
    return false;
  }
}

/**
 * Multi-User Vercel Cron Job: Processes unread emails for ALL users with AI settings enabled.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('🤖 Multi-User Email Response Processing Started');

  try {
    const allUsers = await prisma.user.findMany();
    const users = allUsers.filter(user => {
      const creds = (user.credentials as any) || {};
      return creds.SMTP_HOST && creds.SMTP_PORT && creds.SMTP_USER && creds.SMTP_PASSWORD;
    });

    if (users.length === 0) {
      return NextResponse.json({ success: false, error: 'No users found with SMTP credentials' });
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalErrors = 0;
    const userResults: any[] = [];

    for (const user of users) {
      const result = await processUserEmailResponses(user);
      userResults.push(result);
      totalProcessed += result.processed;
      totalSent += result.sent;
      totalErrors += result.errors;
    }

    return NextResponse.json({
      success: true,
      summary: {
        usersProcessed: users.length,
        totalEmailsProcessed: totalProcessed,
        totalRepliesSent: totalSent,
        totalErrors: totalErrors
      },
      userResults: userResults
    });

  } catch (error: any) {
    console.error('❌ Fatal error in multi-user email processing:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function processUserEmailResponses(user: any): Promise<{ userId: string; email: string; processed: number; sent: number; errors: number; message?: string }> {
  const userIdString = user.id;
  const userEmail = user.email;

  try {
    const unreadEmails = await prisma.incomingEmail.findMany({
      where: {
        status: 'unread',
        userId: userIdString
      }
    });

    if (unreadEmails.length === 0) {
      return { userId: userIdString, email: userEmail, processed: 0, sent: 0, errors: 0, message: 'No unread emails' };
    }

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: userIdString }
    });

    if (!aiSettings || !aiSettings.isEnabled) {
      return { userId: userIdString, email: userEmail, processed: 0, sent: 0, errors: 0, message: 'AI disabled or not configured' };
    }

    const creds = (user.credentials as Record<string, any>) || {};
    const openAiKey = appendEnvKey(
      getApiKeysFromCredentials(creds, 'OPENAI_API_KEY', 'OPENAI_ACCOUNTS'),
      process.env.OPENAI_API_KEY
    )[0] || '';

    if (!openAiKey) {
      return { userId: userIdString, email: userEmail, processed: 0, sent: 0, errors: 1, message: 'No OpenAI API key' };
    }

    let processedEmails = 0;
    let sentReplies = 0;
    let errors = 0;

    for (const email of unreadEmails) {
      try {
        const isThirdReply = (email as any).isThirdReply || (email as any).conversationCount >= 3;

        if (isThirdReply) {
          const success = await saveDutchTemplateAsDraft(email, userIdString, aiSettings);
          if (success) sentReplies++; else errors++;
          processedEmails++;
          continue;
        }

        const aiResponse = await generateAIResponse(email, aiSettings, openAiKey);

        if (aiResponse.isDropped) {
          await prisma.aIResponse.create({
            data: {
              incomingEmailId: email.id,
              generatedSubject: `Re: ${email.subject}`,
              generatedContent: '',
              status: 'failed',
              responseType: 'ai_generated',
              reasoning: aiResponse.reasoning,
              userId: userIdString,
              lastError: aiResponse.reasoning
            }
          });

          await prisma.incomingEmail.update({
            where: { id: email.id },
            data: {
              status: 'processed',
              processedAt: new Date()
            }
          });

          processedEmails++;
          continue;
        }

        const success = await saveAsDraft(email, aiResponse, aiResponse.reasoning, userIdString);
        if (success) sentReplies++; else errors++;
        processedEmails++;

      } catch (error: any) {
        errors++;
        processedEmails++;
      }
    }

    return { userId: userIdString, email: userEmail, processed: processedEmails, sent: sentReplies, errors: errors };

  } catch (error: any) {
    return { userId: userIdString, email: userEmail, processed: 0, sent: 0, errors: 1, message: error.message };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}