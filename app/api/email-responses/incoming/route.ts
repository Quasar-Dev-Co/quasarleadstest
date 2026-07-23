import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import {
  appendEnvKey,
  getApiKeysFromCredentials,
} from '@/lib/api-key-rotation';
import { createEmailTracking, injectTrackingPixel } from '@/lib/email-tracking';

const EMAIL_RESPONSE_MODEL = 'gpt-5.4-nano';

/**
 * POST: Saves a new incoming email to the database.
 * This is called by the IMAP fetching service.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const {
      userId,
      leadEmail,
      subject,
      content,
      htmlContent,
      fromAddress,
      toAddress,
      messageId,
      inReplyTo,
      references,
      isReply,
      isRecent,
      threadId,
    } = body;

    if (!leadEmail || !subject || !content) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: leadEmail, subject, content'
      }, { status: 400 });
    }

    // Find associated lead — only process replies from existing leads we've contacted.
    // Do NOT create new leads from random incoming emails.
    let lead = await prisma.lead.findFirst({
      where: {
        email: {
          equals: leadEmail,
          mode: 'insensitive'
        }
      }
    });

    if (!lead) {
      console.log(`⏭️ No existing lead found for ${leadEmail}. Skipping — not a reply to our outreach.`);
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'No existing lead for this sender. Email ignored.'
      });
    }

    let leadName: string;
    leadName = lead.name || leadEmail.split('@')[0].replace(/[.\-_]/g, ' ');

    // Check if this is a reply to one of our 7 email sequence emails
    let isReplyToSequence = false;
    let originalEmailStage = null;

    const emailHistory = (lead.emailHistory as any[]) || [];

    // Only accept replies that reference a messageId from an email we actually sent.
    // This prevents random inbox emails from being treated as lead replies.
    // Fallback: if messageId matching fails, accept if the subject matches a sent subject
    // (many SMTP providers rewrite messageIds, breaking strict matching).
    if (emailHistory.length > 0) {
      const sentMessageIds = new Set(
        emailHistory
          .map((entry: any) => String(entry?.messageId || '').trim())
          .filter(Boolean)
      );

      const replyRef = String(inReplyTo || references || '').trim();
      const refsList = replyRef.split(/\s+/).map((r) => r.trim()).filter(Boolean);

      const matchesSentEmail =
        sentMessageIds.size > 0 &&
        refsList.some((ref) => sentMessageIds.has(ref));

      // Fallback: subject-based matching. Strip "Re:" / "Fwd:" prefixes and compare
      // against the subjects of emails we sent to this lead.
      let matchesBySubject = false;
      if (!matchesSentEmail) {
        const normalizeSubject = (s: string) =>
          String(s || '').trim()
            .replace(/^((re|fwd|fw|aw|wg):\s*)+/i, '')
            .trim()
            .toLowerCase();
        const replySubjectNorm = normalizeSubject(subject);
        if (replySubjectNorm) {
          const sentSubjects = new Set(
            emailHistory
              .filter((e: any) => e?.status === 'sent')
              .map((e: any) => normalizeSubject(e?.subject || ''))
              .filter(Boolean)
          );
          matchesBySubject = sentSubjects.has(replySubjectNorm);
        }
      }

      if (!matchesSentEmail && !matchesBySubject) {
        console.log(`⏭️ Reply from ${leadEmail} does not reference any sent email messageId or subject. Skipping.`);
        return NextResponse.json({
          success: true,
          skipped: true,
          message: 'Reply does not match any sent email. Ignored.'
        });
      }

      const emailStages = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentEmails = emailHistory.filter((email: any) =>
        email.status === 'sent' &&
        email.sentAt &&
        new Date(email.sentAt) > thirtyDaysAgo &&
        emailStages.includes(email.stage)
      );

      if (recentEmails.length > 0) {
        isReplyToSequence = true;
        originalEmailStage = recentEmails[recentEmails.length - 1].stage;
        console.log(`🎯 Detected reply to email sequence! Original stage: ${originalEmailStage}`);
      }
    } else {
      // Lead exists but has no email history — we never sent them an email, so this isn't a reply to our outreach.
      console.log(`⏭️ Lead ${leadEmail} has no email history. Skipping — we never sent them an email.`);
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Lead has no sent email history. Reply ignored.'
      });
    }

    // Now that we've confirmed this is a genuine reply to our outreach, update lead status.
    if (lead.status !== 'replied') {
      const updatedLead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'replied',
          lastContactedAt: new Date()
        }
      });
      lead = updatedLead;
      console.log(`✅ Updated lead ${leadEmail} status to 'replied'`);
    }

    let conversationCount = 0;
    let conversationId = `conv-${leadEmail.toLowerCase()}-${Date.now()}`;
    let isThirdReply = false;

    const previousEmails = await prisma.incomingEmail.findMany({
      where: {
        leadEmail: {
          equals: leadEmail,
          mode: 'insensitive'
        },
        userId: userId || undefined
      },
      orderBy: { receivedAt: 'desc' },
      take: 10
    });

    if (previousEmails.length > 0) {
      conversationId = previousEmails[0].conversationId || conversationId;
      conversationCount = previousEmails.length + 1;

      if (conversationCount >= 3) {
        isThirdReply = true;
        console.log(`🔄 This is the ${conversationCount}th reply from ${leadEmail} - will send final template`);
      } else {
        console.log(`🔄 This is the ${conversationCount}th reply from ${leadEmail} - will send AI response`);
      }
    } else {
      conversationCount = 1;
      console.log(`🆕 First email from ${leadEmail} - will send AI response`);
    }

    const incomingEmail = await prisma.incomingEmail.create({
      data: {
        userId: userId || undefined,
        leadId: lead.id,
        leadName: leadName,
        leadEmail: leadEmail,
        subject: subject,
        content: content,
        htmlContent: htmlContent || '',
        status: 'unread',
        isReply: isReply || isReplyToSequence,
        isRecent: isRecent !== undefined ? isRecent : true,
        threadId: threadId || `thread-${Date.now()}-${Math.random()}`,
        conversationCount: conversationCount,
        conversationId: conversationId,
        isThirdReply: isThirdReply,
        metadata: {
          messageId: messageId || '',
          inReplyTo: inReplyTo || '',
          fromAddress: fromAddress || leadEmail,
          toAddress: toAddress || '',
          references: references || '',
          originalEmailStage: originalEmailStage,
          isReplyToSequence: isReplyToSequence
        }
      }
    });

    console.log(`📧 New incoming email saved from ${leadEmail}`);

    return NextResponse.json({
      success: true,
      emailId: incomingEmail.id,
      message: 'Incoming email saved. Cron job will generate draft response for user review.',
      isReplyToSequence: isReplyToSequence,
      originalStage: originalEmailStage,
      conversationCount: conversationCount,
      isThirdReply: isThirdReply,
      status: incomingEmail.status
    });

  } catch (error: any) {
    console.error('❌ Error processing incoming email:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to process incoming email'
    }, { status: 500 });
  }
}

/**
 * GET: Fetches a paginated list of incoming emails.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const authHeader = request.headers.get('authorization') || '';
    const bearerUserId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    const query: any = {};
    if (bearerUserId) {
      query.userId = bearerUserId;
    }

    const emails = await prisma.incomingEmail.findMany({
      where: query,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    const totalCount = await prisma.incomingEmail.count({ where: query });

    return NextResponse.json({
      success: true,
      emails: emails.map(email => ({
        id: email.id,
        leadId: email.leadId || '',
        leadName: email.leadName,
        leadEmail: email.leadEmail,
        leadCompany: email.leadEmail.split('@')[1] || 'Unknown',
        subject: email.subject,
        content: email.content,
        htmlContent: email.htmlContent || '',
        status: email.status,
        receivedAt: email.receivedAt,
        respondedAt: email.respondedAt,
        isReply: email.isReply || false,
        isRecent: email.isRecent !== undefined ? email.isRecent : true,
        threadId: email.threadId || '',
        sentiment: email.sentiment || 'neutral',
        originalEmailId: email.originalEmailId || '',
        metadata: email.metadata || {}
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching incoming emails:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch incoming emails'
    }, { status: 500 });
  }
}

// PUT - Update email status
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { emailId, status, sentiment } = body;

    if (!emailId) {
      return NextResponse.json({
        success: false,
        error: 'Email ID is required'
      }, { status: 400 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (sentiment) updateData.sentiment = sentiment;
    if (status === 'read') updateData.processedAt = new Date();

    const updatedEmail = await prisma.incomingEmail.update({
      where: { id: emailId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      email: updatedEmail,
      message: 'Email updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error updating email:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update email'
    }, { status: 500 });
  }
}

/**
 * Generate beautiful Dutch final template for 3rd+ replies
 */
async function generateDutchFinalTemplate(incomingEmail: any, lead: any): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🇳🇱 Generating beautiful Dutch final template for ${lead.email} (3rd+ reply)`);

    const userId = (incomingEmail as any)?.userId?.toString();
    if (!userId) {
      return { success: false, error: 'Missing userId for SMTP sending' };
    }

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: userId }
    });

    const companyName = aiSettings?.companyName || 'QuasarSEO';
    const subject = `Re: ${incomingEmail.subject}`;
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
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 300;">Hallo ${incomingEmail.leadName}! 👋</h1>
    </div>
    
    <div style="background: white; padding: 40px; border-radius: 0 0 15px 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        <p style="font-size: 18px; color: #2c3e50; margin-bottom: 25px;">
            <strong>Dank je wel voor je blijvende interesse en vragen!</strong> 🙏
        </p>
        
        <p style="font-size: 16px; margin-bottom: 20px; color: #34495e;">
            Ik waardeer het enorm dat je de tijd hebt genomen om meerdere keren contact op te nemen. 
            Om ervoor te zorgen dat je de meest uitgebreide en persoonlijke ondersteuning krijgt, 
            zou ik graag direct met je in contact komen.
        </p>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0; font-size: 16px; color: #2c3e50;">
                <strong>${companyName}</strong> is gespecialiseerd in AI-gestuurde leadgeneratie en digitale marketingoplossingen. 
                We hebben talloze bedrijven geholpen hun activiteiten op te schalen en hun omzet te verhogen 
                door middel van onze innovatieve benaderingen. 🚀
            </p>
        </div>
        
        <p style="font-size: 16px; margin-bottom: 25px; color: #34495e;">
            Als je specifieke vragen hebt of wilt bespreken hoe we je bedrijf kunnen helpen groeien, 
            plan ik graag een kort consultatiegesprek in waarin we dieper kunnen ingaan op jouw behoeften 
            en mogelijke oplossingen kunnen verkennen.
        </p>
        
        <div style="text-align: center; margin: 35px 0;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <p style="color: white; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">
                    📅 Boek nu je gratis consultatiegesprek!
                </p>
                <a href="https://booking.quasarleads.com/${userId}" 
                   style="display: inline-block; background: white; color: #667eea; padding: 15px 30px; 
                          text-decoration: none; border-radius: 25px; font-weight: 600; font-size: 16px;
                          box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease;">
                    🔗 Klik hier om een afspraak in te plannen
                </a>
            </div>
        </div>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #27ae60;">
                ✨ <strong>Waarom kiezen voor ${companyName}?</strong><br>
                • Bewezen resultaten • AI-gedreven aanpak • Persoonlijke begeleiding • Gratis eerste consult
            </p>
        </div>
        
        <p style="font-size: 16px; color: #34495e; text-align: center; margin-top: 30px;">
            Ik kijk ernaar uit om binnenkort met je te spreken! 😊
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ecf0f1; text-align: center;">
            <p style="margin: 0; font-size: 16px; color: #667eea; font-weight: 600;">
                Met vriendelijke groet,<br>
                <span style="color: #2c3e50;">Team ${companyName}</span>
            </p>
        </div>
    </div>
    
    <div style="text-align: center; margin-top: 20px; padding: 15px;">
        <p style="font-size: 12px; color: #7f8c8d; margin: 0;">
            Deze e-mail is automatisch gegenereerd. Voor directe vragen, boek een gesprek via de link hierboven.
        </p>
    </div>
</body>
</html>`;

    const textContent = `Hallo ${incomingEmail.leadName}!\nDank je wel voor je blijvende interesse en vragen!\n\nIk waardeer het enorm dat je de tijd hebt genomen om meerdere keren contact op te nemen. Om ervoor te zorgen dat je de meest uitgebreide en persoonlijke ondersteuning krijgt, zou ik graag direct met je in contact komen.\n\n${companyName} is gespecialiseerd in AI-gestuurde leadgeneratie en digitale marketingoplossingen. We hebben talloze bedrijven geholpen hun activiteiten op te schalen en hun omzet te verhogen door middel van onze innovatieve benaderingen.\n\nAls je specifieke vragen hebt of wilt bespreken hoe we je bedrijf kunnen helpen groeien, plan ik graag een kort consultatiegesprek in waarin we dieper kunnen ingaan op jouw behoeften en mogelijke oplossingen kunnen verkennen.\n\n📅 Boek nu je gratis consultatiegesprek:\nhttps://booking.quasarleads.com/${userId}\n\nMet vriendelijke groet,\nTeam ${companyName}`;

    const newAIResponse = await prisma.aIResponse.create({
      data: {
        incomingEmailId: incomingEmail.id,
        generatedSubject: subject,
        generatedContent: htmlContent,
        status: 'sending',
        responseType: 'final_template',
        reasoning: `Beautiful Dutch final template for 3rd+ reply`,
        userId: userId,
      }
    });

    const emailService = require('@/lib/emailService').emailService;
    let finalHtml = htmlContent;
    let trackingId = '';
    if (incomingEmail.leadId) {
      trackingId = await createEmailTracking({
        leadId: incomingEmail.leadId,
        userId,
        stage: 'final_template',
        recipientEmail: incomingEmail.leadEmail,
        subject,
      });
      if (trackingId) {
        finalHtml = injectTrackingPixel(htmlContent, trackingId);
      }
    }
    const emailPayload = {
      to: incomingEmail.leadEmail,
      subject: subject,
      text: textContent,
      html: finalHtml,
    };
    const emailResult = await emailService.sendEmailForUser(userId, emailPayload);

    if (emailResult.success) {
      await prisma.aIResponse.update({
        where: { id: newAIResponse.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          sentMessageId: emailResult.messageId
        }
      });
      return { success: true };
    } else {
      return { success: false, error: `Failed to send email: ${emailResult.error}` };
    }
  } catch (error: any) {
    console.error(`❌ Error generating Dutch final template:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate AI response for replies to email sequence
 */
async function generateAIResponseForSequenceReply(incomingEmail: any, lead: any, originalStage: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = (incomingEmail as any)?.userId?.toString();
    if (!userId) return { success: false, error: 'Missing userId' };

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: userId }
    });

    if (!aiSettings) return { success: false, error: 'AI settings not found' };

    const sequenceReplyPrompt = `**CRITICAL DIRECTIVES: Failure to follow these rules will result in an error. This is not a suggestion.**

1. **SIGNATURE:** The response MUST end with **EXACTLY** this signature:
   Warmly,
   Team QuasarSEO

2. **NO PLACEHOLDERS:** You MUST NOT use placeholders like \`[Your Name]\` or \`[insert their concern]\` in your final output.

3. **CONTEXT:** This is a reply to one of our 7-email sequence. The original email was from stage: \${originalStage}

4. **TONE:** The tone must be warm, human, and helpful. ABSOLUTELY NO sales pressure.

**Your Persona:** You are a calm, engaged entrepreneur who truly listens. Your goal is to establish a connection and gently guide them to schedule a casual Zoom meeting.

**Response Structure (Follow this EXACTLY):**

**1. Acknowledge with Genuine Attention:**
Show empathy and understanding based on the client's email.

**2. Ask an Open-Ended Follow-up Question:**
Invite dialogue with a soft, open question.

**3. Gently Suggest a Zoom Call (If appropriate):**
Offer a low-pressure call and provide the booking link.
*Rule:* When user asked for meeting then, You have to suggest a call, ONLY send or mention this link: https://booking.quasarleads.com/${userId} dont asked for any date and time, just send the link and tell got to the link and book the meeting.

**4. End with a Friendly, Open Tone:**
Let them know they can reply at their convenience.

**PERFECT RESPONSE EXAMPLE:**
Hi [Client's Name],

Thanks so much for reaching out. I completely understand what you're looking for and how important it is to find the right path forward. It sounds like you're really thinking about [their specific concern, which you will identify] right now, and I'd love to help however I can.

What has been the most important factor for you in this decision? I'd love to hear more about what's on your mind.

If it feels right, maybe we can take a few minutes to look at this together. I'd be happy to jump on a quick Zoom call to brainstorm ideas and see what could work best for you. Here's a link to book a time that works for you: https://booking.quasarleads.com/${userId}

No rush at all — feel free to reach out when it's convenient for you. I'm looking forward to hearing from you soon.

Warmly,
Team QuasarSEO

**FINAL CHECK: Before responding, verify you have followed all CRITICAL DIRECTIVES.**`;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true },
    });

    const openAiKey = appendEnvKey(
      getApiKeysFromCredentials((user?.credentials as Record<string, any>) || {}, 'OPENAI_API_KEY', 'OPENAI_ACCOUNTS'),
      process.env.OPENAI_API_KEY
    )[0] || '';

    if (!openAiKey) return { success: false, error: 'OpenAI API key not configured' };

    const userPrompt = `Here is the email reply you need to respond to:

FROM: ${incomingEmail.leadName} (${incomingEmail.leadEmail})
SUBJECT: ${incomingEmail.subject}
CONTENT:
---
${incomingEmail.content}
---

This is a reply to our email sequence (original stage: ${originalStage}). Respond according to the configured instructions.`;

    const openai = new OpenAI({ apiKey: openAiKey });

    let aiContent = '';

    try {
      const response = await openai.responses.create({
        model: EMAIL_RESPONSE_MODEL,
        input: [
          { role: 'system', content: sequenceReplyPrompt },
          { role: 'user', content: userPrompt }
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
          { role: 'system', content: sequenceReplyPrompt },
          { role: 'user', content: userPrompt }
        ],
      });

      aiContent = completion.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!aiContent) return { success: false, error: 'OpenAI response was empty' };

    const subject = `Re: ${incomingEmail.subject}`;

    const newAIResponse = await prisma.aIResponse.create({
      data: {
        incomingEmailId: incomingEmail.id,
        generatedSubject: subject,
        generatedContent: aiContent,
        status: 'sending',
        responseType: 'sequence_reply',
        reasoning: `Auto-generated response for reply to email sequence (stage: ${originalStage})`,
        userId: userId,
      }
    });

    const emailService = require('@/lib/emailService').emailService;
    const aiHtmlContent = `<div style="font-family: Arial, sans-serif;">${aiContent.replace(/\n/g, '<br>')}</div>`;
    let aiFinalHtml = aiHtmlContent;
    let aiTrackingId = '';
    if (incomingEmail.leadId) {
      aiTrackingId = await createEmailTracking({
        leadId: incomingEmail.leadId,
        userId,
        stage: 'ai_sequence_reply',
        recipientEmail: incomingEmail.leadEmail,
        subject,
      });
      if (aiTrackingId) {
        aiFinalHtml = injectTrackingPixel(aiHtmlContent, aiTrackingId);
      }
    }
    const emailPayload = {
      to: incomingEmail.leadEmail,
      subject: subject,
      text: aiContent,
      html: aiFinalHtml,
    };
    const emailResult = await emailService.sendEmailForUser(userId, emailPayload);

    if (emailResult.success) {
      await prisma.aIResponse.update({
        where: { id: newAIResponse.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          sentMessageId: emailResult.messageId
        }
      });
      return { success: true };
    } else {
      return { success: false, error: 'Failed to send email' };
    }
  } catch (error: any) {
    console.error(`❌ Error generating AI response:`, error);
    return { success: false, error: error.message };
  }
}

function analyzeSentiment(content: string): string {
  const text = content.toLowerCase();

  const positiveKeywords = ['interested', 'yes', 'sounds good', 'perfect', 'great', 'excellent', 'love', 'amazing', 'awesome', 'fantastic', 'wonderful', 'please', 'would like', 'want to', 'schedule', 'meeting', 'call', 'discuss', 'when can', 'available', 'book', 'appointment', 'demo'];
  const negativeKeywords = ['not interested', 'no thanks', 'remove', 'unsubscribe', 'stop', 'spam', 'scam', 'fake', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed', 'waste', 'useless', 'never'];
  const interestedKeywords = ['more information', 'tell me more', 'pricing', 'cost', 'price', 'how much', 'budget', 'quote', 'proposal', 'details', 'learn more', 'features', 'benefits', 'trial', 'free', 'demo'];
  const notInterestedKeywords = ['not interested', 'no thanks', 'already have', 'not right now', 'maybe later', 'not a fit', 'wrong timing', 'too expensive', 'budget constraints', 'not in budget'];

  let positiveScore = 0;
  let negativeScore = 0;
  let interestedScore = 0;
  let notInterestedScore = 0;

  positiveKeywords.forEach(keyword => { if (text.includes(keyword)) positiveScore++; });
  negativeKeywords.forEach(keyword => { if (text.includes(keyword)) negativeScore++; });
  interestedKeywords.forEach(keyword => { if (text.includes(keyword)) interestedScore++; });
  notInterestedKeywords.forEach(keyword => { if (text.includes(keyword)) notInterestedScore++; });

  if (interestedScore > 0 && positiveScore > negativeScore) return 'interested';
  if (notInterestedScore > 0 || negativeScore > positiveScore) return 'not_interested';
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
}