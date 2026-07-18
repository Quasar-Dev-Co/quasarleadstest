import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { appendEnvKey, getApiKeysFromCredentials } from '@/lib/api-key-rotation';
import { selectSmtpAccountWithEnvFallback, incrementSmtpSentCount, SMTP_DAILY_LIMIT_PER_ACCOUNT } from '@/lib/smtp-rotation';
import { createEmailTracking, injectTrackingPixel } from '@/lib/email-tracking';

const MAX_RETRY_ATTEMPTS = 0;
const EMAIL_GENERATION_MODEL = 'gpt-5.4-nano';

function serializeError(error: any) {
  if (!error) return { message: 'Unknown error' };

  return {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    status: error?.status,
    type: error?.type,
    param: error?.param,
    requestId: error?.request_id,
    headers: error?.headers,
    error: error?.error,
    cause: error?.cause,
    stack: error?.stack,
  };
}

function logDetailedError(scope: string, error: any, context: Record<string, any> = {}) {
  console.error(
    `[CRON][${scope}]`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        context,
        error: serializeError(error),
      },
      null,
      2
    )
  );
}

async function resolveOpenAiKeyForLead(lead: any): Promise<string> {
  const userId = lead?.userId || lead?.assignedTo || lead?.leadsCreatedBy;

  let credentialKeys: string[] = [];
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });

    credentialKeys = getApiKeysFromCredentials(
      (user?.credentials as Record<string, any>) || {},
      'OPENAI_API_KEY',
      'OPENAI_ACCOUNTS'
    );
  }

  const keys = appendEnvKey(credentialKeys, process.env.OPENAI_API_KEY);
  return keys[0] || '';
}

function buildDeterministicFallbackEmail(lead: any, companySettings: any, stage: string): string {
  const leadName = lead?.name || 'there';
  const companyName = lead?.company || 'your company';
  const service = companySettings?.service || 'AI-powered lead generation';
  const sender = companySettings?.senderName || 'QuasarLeads Team';
  const website = companySettings?.websiteUrl || 'https://quasarleads.com';
  const stageLabel = String(stage || '').replace(/_/g, ' ');

  return [
    `<p>Hello ${leadName},</p>`,
    `<p>I hope you are doing well. I wanted to quickly follow up regarding ${companyName} and share how ${service} can help you improve qualified inbound opportunities.</p>`,
    `<p>At this ${stageLabel} stage, our goal is simple: identify high-intent prospects, personalize outreach, and convert more conversations into booked calls without adding manual workload.</p>`,
    `<p>If useful, I can send a short plan tailored to your market. You can also have a quick look here: <a href="${website}" target="_blank" rel="noopener noreferrer">${website}</a>.</p>`,
    `<p>Best regards,<br/>${sender}</p>`,
  ].join('');
}

// Load email templates and settings from database
async function getEmailTemplateAndSettings(stage: string, userId?: string) {
  try {
    let template = null;

    if (userId) {
      template = await prisma.emailTemplate.findUnique({
        where: {
          stage_userId: { stage, userId }
        }
      });
    }

    if (!template) {
      template = await prisma.emailTemplate.findFirst({
        where: { stage, userId: null, isActive: true }
      });
    }

    let companySettings = null;
    if (userId) {
      companySettings = await prisma.companySettings.findUnique({
        where: { userId }
      });
    }
    if (!companySettings) {
      companySettings = await prisma.companySettings.findFirst({
        where: { type: 'default' }
      });
    }

    return {
      template,
      companySettings,
      timing: (companySettings?.emailTimings as any[])?.find((t: any) => t.stage === stage)
    };
  } catch (error) {
    console.error(`❌ Error loading template/settings for stage ${stage}:`, error);
    return { template: null, companySettings: null, timing: null };
  }
}

function getAuthorName(lead: any): string {
  const authInfo = (lead.authInformation as any) || {};
  return authInfo.owner_name || lead.companyOwner || authInfo.executive_name || lead.name || 'Team';
}

function getInterestKeywords(lead: any): string {
  const authInfo = (lead.authInformation as any) || {};
  return authInfo.interest_keywords || '';
}

function getCompanyLinkedin(lead: any): string {
  const authInfo = (lead.authInformation as any) || {};
  return authInfo.company_linkedin || '';
}

function replaceEmailVariables(content: string, lead: any, companySettings: any = null): string {
  const senderIdentity = lead?.senderIdentity || companySettings?.defaultSenderIdentity || 'company';
  const chosenSenderName = senderIdentity === 'author'
    ? getAuthorName(lead)
    : (companySettings?.senderName || 'QuasarSEO Team');

  const companyReview = lead?.rating && lead?.reviews
    ? `${lead.rating} stars with ${lead.reviews} reviews`
    : lead?.rating
      ? `Rated ${lead.rating} stars`
      : 'your company';

  const variables: Record<string, string> = {
    '{{NAME}}': lead.name || 'there',
    '{{LEAD_NAME}}': lead.name || 'there',
    '{{OWNER_NAME}}': getAuthorName(lead),
    '{{COMPANY_NAME}}': lead.company || 'your company',
    '{{COMPANY_REVIEW}}': companyReview,
    '{{INTEREST_KEYWORDS}}': getInterestKeywords(lead),
    '{{LEAD_LINKEDIN}}': (lead as any).linkedinProfile || '',
    '{{COMPANY_LINKEDIN}}': getCompanyLinkedin(lead),
    '{{LOCATION}}': lead.location || 'your area',
    '{{EMAIL}}': lead.email,
    '{{SENDER_NAME}}': chosenSenderName,
    '{{SENDER_EMAIL}}': companySettings?.senderEmail || 'info@quasarseo.nl',
    '{{COMPANY_SERVICE}}': companySettings?.service || 'AI-powered lead generation',
    '{{TARGET_INDUSTRY}}': companySettings?.industry || 'Technology',
    '{{WEBSITE_URL}}': companySettings?.websiteUrl || 'https://quasarleads.com',
    '{{SERVICE_NAME}}': (lead as any).searchService || '',
    '{{LOCATION_NAME}}': (lead as any).searchLocation || ''
  };

  let processedContent = content;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
    processedContent = processedContent.replace(regex, value);
  });

  return processedContent;
}

async function generateEmailContentFromPrompt(prompt: string, lead: any, companySettings: any, stage: string): Promise<string> {
  try {
    const apiKey = await resolveOpenAiKeyForLead(lead);
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY for email content generation');
    }

    const openai = new OpenAI({ apiKey });
    const authInfo = (lead.authInformation as any) || {};
    const stageLabel = String(stage || '').replace(/_/g, ' ');

    const systemPrompt = `You are an expert B2B outbound email copywriter.
Return ONLY valid HTML body content (no markdown, no code fences, no subject, no signature).
Write concise, personalized, high-converting emails with clear value and one CTA.
Use short paragraphs and professional, natural tone.`;

    const aiPrompt = `Use this template guidance as the main instruction:
${prompt}

Lead context:
- Lead name: ${lead?.name || ''}
- Company: ${lead?.company || ''}
- Location: ${lead?.location || ''}
- Website: ${lead?.website || ''}
- Stage: ${stageLabel}
- Company review context: ${lead?.rating ? `${lead.rating} stars` : 'N/A'}${lead?.reviews ? `, ${lead.reviews} reviews` : ''}
- Interest keywords: ${getInterestKeywords(lead) || 'N/A'}
- Lead LinkedIn: ${(lead as any).linkedinProfile || 'N/A'}
- Company LinkedIn: ${getCompanyLinkedin(lead) || 'N/A'}

Sender/business context:
- Service: ${companySettings?.service || 'AI-powered lead generation'}
- Target industry: ${companySettings?.industry || 'Technology'}
- Website URL: ${companySettings?.websiteUrl || 'https://quasarleads.com'}
- Sender name placeholder: {{SENDER_NAME}}

Author/company contact context:
- Company email: ${authInfo?.company_email || ''}
- Owner name: ${authInfo?.owner_name || ''}
- Manager name: ${authInfo?.manager_name || ''}
- Executive name: ${authInfo?.executive_name || ''}

Hard requirements:
1) Include these placeholders naturally if relevant: {{LEAD_NAME}}, {{COMPANY_NAME}}, {{COMPANY_REVIEW}}, {{INTEREST_KEYWORDS}}, {{LEAD_LINKEDIN}}, {{COMPANY_LINKEDIN}}, {{SENDER_NAME}}, {{COMPANY_SERVICE}}, {{TARGET_INDUSTRY}}
2) Keep it specific and meaningful (not generic filler)
3) Return only the HTML body content.`;

    let generatedContent = '';

    try {
      const response = await openai.responses.create({
        model: EMAIL_GENERATION_MODEL,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: aiPrompt }
        ],
        max_output_tokens: 900,
        store: false,
      });

      generatedContent = String((response as any)?.output_text || '').trim();

      if (!generatedContent) {
        const output = (response as any)?.output;
        if (Array.isArray(output)) {
          for (const item of output) {
            const contentItems = item?.content;
            if (!Array.isArray(contentItems)) continue;
            for (const contentItem of contentItems) {
              if (contentItem?.type === 'output_text' && typeof contentItem?.text === 'string' && contentItem.text.trim()) {
                generatedContent = contentItem.text.trim();
                break;
              }
            }
            if (generatedContent) break;
          }
        }
      }
    } catch (responsesError: any) {
      logDetailedError('EMAIL_CONTENT_GENERATION_RESPONSES_ERROR', responsesError, {
        leadId: lead?.id,
        stage,
        model: EMAIL_GENERATION_MODEL,
        promptPreview: String(prompt || '').slice(0, 400),
      });
    }

    // Fallback on same model via Chat Completions for compatibility.
    if (!generatedContent) {
      const completion = await openai.chat.completions.create({
        model: EMAIL_GENERATION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: aiPrompt }
        ],
      });

      generatedContent = completion.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!generatedContent) {
      throw new Error('OpenAI returned empty email content');
    }

    generatedContent = generatedContent.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
    return generatedContent;
  } catch (error: any) {
    logDetailedError('EMAIL_CONTENT_GENERATION_FAILED', error, {
      leadId: lead?.id,
      stage,
      model: EMAIL_GENERATION_MODEL,
      promptPreview: String(prompt || '').slice(0, 400),
    });

    return buildDeterministicFallbackEmail(lead, companySettings, stage);
  }
}

async function assembleFinalEmail(template: any, lead: any, companySettings: any, stage: string): Promise<{ htmlContent: string; textContent: string }> {
  let finalHTML = '';
  let finalText = '';

  if (template.contentPrompt && template.contentPrompt.trim()) {
    const generatedContent = await generateEmailContentFromPrompt(template.contentPrompt, lead, companySettings, stage);
    const processedContent = replaceEmailVariables(generatedContent, lead, companySettings);
    const processedSignature = (template.emailSignature && template.emailSignature.trim()) ? replaceEmailVariables(template.emailSignature, lead, companySettings) : '';
    const processedMediaLinks = (template.mediaLinks && template.mediaLinks.trim()) ? replaceEmailVariables(template.mediaLinks, lead, companySettings) : '';

    finalHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="padding: 20px; background: white;">
          ${processedContent}
          ${processedMediaLinks ? `<div style="margin: 40px 0; text-align: center; line-height: 0;">${processedMediaLinks}</div>` : ''}
          ${processedSignature ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; line-height: 1.5;">${processedSignature}</div>` : ''}
        </div>
      </div>
    `;
    finalText = `${processedContent.replace(/<[^>]*>/g, '')}\n\n${processedMediaLinks ? 'Media: ' + processedMediaLinks.replace(/<[^>]*>/g, '') + '\n\n' : ''}${processedSignature.replace(/<[^>]*>/g, '')}`;
  } else {
    finalHTML = replaceEmailVariables(template.htmlContent || '', lead, companySettings);
    finalText = replaceEmailVariables(template.textContent || '', lead, companySettings);
  }

  return { htmlContent: finalHTML, textContent: finalText };
}

async function sendEmailWithRetry(lead: any, stage: string, retryCount: number = 0): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const userId = lead.userId || lead.assignedTo || lead.leadsCreatedBy;
    const { template, companySettings, timing } = await getEmailTemplateAndSettings(stage, userId);

    if (!template) throw new Error(`No active template found for stage: ${stage}`);

    const { htmlContent, textContent } = await assembleFinalEmail(template, lead, companySettings, stage);
    const subject = replaceEmailVariables(template.subject, lead, companySettings);

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        emailStatus: 'sending',
        emailLastAttempt: new Date(),
        emailRetryCount: retryCount
      }
    });

    const smtpResult = await selectSmtpAccountWithEnvFallback(userId);
    if (!smtpResult.ok) {
      if (smtpResult.reason === 'all_exhausted') {
        throw new Error(`All SMTP accounts have reached their daily limit of ${SMTP_DAILY_LIMIT_PER_ACCOUNT} emails. Emails will resume tomorrow.`);
      }
      throw new Error(`SMTP connection failed: ${smtpResult.errors.join(' || ')}`);
    }

    const smtpAccount = smtpResult.account;
    const transporter = smtpAccount.transporter;
    let senderEmail = smtpAccount.SMTP_USER || 'info@quasarseo.nl';
    let senderName = 'QuasarSEO Team';

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      senderName = user?.username || senderName;
    }

    const authInfo = (lead.authInformation as any) || {};
    const chosenTo = (lead.outreachRecipient === 'company' && authInfo.company_email) ? authInfo.company_email : lead.email;
    const fromName = (lead.senderIdentity === 'author') ? getAuthorName(lead) : (companySettings?.senderName || senderName);

    // Create tracking record and inject pixel
    const trackingId = await createEmailTracking({
      leadId: lead.id,
      userId: userId || undefined,
      stage,
      recipientEmail: chosenTo,
      subject,
    });
    const finalHtml = trackingId ? injectTrackingPixel(htmlContent, trackingId) : htmlContent;

    const info = await transporter.sendMail({
      from: { name: fromName, address: senderEmail },
      to: chosenTo,
      subject: subject,
      text: textContent,
      html: finalHtml,
    });

    if (userId && smtpAccount.index >= 0) {
      await incrementSmtpSentCount(userId, smtpAccount.SMTP_USER, smtpAccount.SMTP_HOST);
    }

    const nextStage = getNextStage(stage);
    let nextScheduledEmail = null;
    let sequenceCompleted = false;
    if (nextStage) {
      // Check if the next stage has an active template available
      const nextTemplate = await prisma.emailTemplate.findFirst({
        where: {
          stage: nextStage,
          isActive: true,
          OR: [{ userId: userId }, { userId: null }, { userId: '' }]
        }
      });

      if (nextTemplate) {
        const { timing: nextTiming } = await getEmailTemplateAndSettings(nextStage, userId);
        const delayMs = nextTiming ? convertTimingToMs(nextTiming.delay, nextTiming.unit) : 7 * 24 * 60 * 60 * 1000;
        nextScheduledEmail = new Date(Date.now() + delayMs);
      } else {
        // No template for the next stage — sequence is complete
        sequenceCompleted = true;
      }
    } else {
      // No next stage (was called_seven_times) — sequence is complete
      sequenceCompleted = true;
    }

    const emailHistory = (lead.emailHistory as any[]) || [];
    emailHistory.push({
      stage: stage,
      sentAt: new Date(),
      messageId: info.messageId,
      status: 'sent',
      retryCount: retryCount,
      manual: false,
      trackingId: trackingId || undefined,
      emailContent: { subject, htmlContent, textContent, from: senderEmail, to: lead.email }
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        emailSequenceStage: stage,
        emailSequenceStep: getStepNumber(stage),
        nextScheduledEmail: nextScheduledEmail,
        emailStatus: sequenceCompleted ? 'completed' : 'sent',
        emailSequenceActive: sequenceCompleted ? false : true,
        emailStoppedReason: sequenceCompleted ? 'Sequence completed — no more templates' : null,
        emailRetryCount: 0,
        emailFailureCount: 0,
        lastEmailedAt: new Date(),
        emailHistory: emailHistory
      }
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    logDetailedError('SEND_EMAIL_WITH_RETRY_FAILED', error, {
      leadId: lead?.id,
      stage,
      retryCount,
      assignedTo: lead?.assignedTo,
      leadsCreatedBy: lead?.leadsCreatedBy,
    });

    const emailErrors = (lead.emailErrors as any[]) || [];
    emailErrors.push({
      attempt: retryCount + 1,
      error: error?.message || 'Unknown error',
      details: serializeError(error),
      timestamp: new Date()
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        emailSequenceActive: false,
        emailStatus: 'failed',
        emailLastAttempt: new Date(),
        emailFailureCount: (lead.emailFailureCount || 0) + 1,
        emailStoppedReason: `Email sending failed: ${error?.message || 'Unknown error'}`,
        emailErrors: emailErrors
      }
    });
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

function getStepNumber(stage: string): number {
  const stageMap: Record<string, number> = { 'called_once': 1, 'called_twice': 2, 'called_three_times': 3, 'called_four_times': 4, 'called_five_times': 5, 'called_six_times': 6, 'called_seven_times': 7 };
  return stageMap[stage] || 1;
}

function getNextStage(currentStage: string): string | null {
  const stageFlow: Record<string, string | null> = { 'called_once': 'called_twice', 'called_twice': 'called_three_times', 'called_three_times': 'called_four_times', 'called_four_times': 'called_five_times', 'called_five_times': 'called_six_times', 'called_six_times': 'called_seven_times', 'called_seven_times': null };
  return stageFlow[currentStage] || null;
}

function convertTimingToMs(delay: number, unit: string): number {
  switch (unit) {
    case 'minutes': return delay * 60 * 1000;
    case 'hours': return delay * 60 * 60 * 1000;
    case 'days': return delay * 24 * 60 * 60 * 1000;
    default: return delay * 24 * 60 * 60 * 1000;
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const leadsToProcess = [];
    const maxLeadsToProcess = 20;
    let attempts = 0;

    while (leadsToProcess.length < maxLeadsToProcess && attempts < 100) {
      attempts++;
      const lead = await prisma.lead.findFirst({
        where: {
          emailSequenceActive: true,
          emailAutomationEnabled: true,
          nextScheduledEmail: { lte: now },
          OR: [
            { emailStatus: { in: ['ready', 'sent'] } },
            { emailStatus: null },
          ]
        },
        orderBy: { nextScheduledEmail: 'asc' }
      });

      if (!lead) break;

      const lockResult = await prisma.lead.updateMany({
        where: {
          id: lead.id,
          nextScheduledEmail: { lte: now },
          OR: [
            { emailStatus: { in: ['ready', 'sent'] } },
            { emailStatus: null },
          ]
        },
        data: { emailStatus: 'processing', emailLastAttempt: now }
      });

      if (lockResult.count === 0) {
        continue;
      }

      const lockedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
      if (lockedLead) {
        leadsToProcess.push(lockedLead);
      }
    }

    let successCount = 0;
    let failureCount = 0;
    let smtpExhausted = false;

    for (const lead of leadsToProcess) {
      if (smtpExhausted) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailStatus: 'ready', emailLastAttempt: new Date() }
        });
        continue;
      }

      const emailHistory = (lead.emailHistory as any[]) || [];
      const sentEmails = emailHistory.filter((e: any) => e.status === 'sent');
      const emailsSentCount = sentEmails.length;

      const userId = lead.assignedTo || lead.leadsCreatedBy;
      const allStages = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];

      // Check which stages have templates available for this user
      const availableStages: string[] = [];
      for (const stage of allStages) {
        const tmpl = await prisma.emailTemplate.findFirst({
          where: {
            stage,
            isActive: true,
            OR: [{ userId: userId }, { userId: null }, { userId: '' }]
          }
        });
        if (tmpl) availableStages.push(stage);
      }

      if (availableStages.length === 0 || emailsSentCount >= availableStages.length) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailSequenceActive: false, emailStatus: 'completed', emailStoppedReason: 'Sequence completed', nextScheduledEmail: null }
        });
        continue;
      }

      const nextStage = availableStages[emailsSentCount];
      const result = await sendEmailWithRetry(lead, nextStage, lead.emailRetryCount || 0);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        if (result.error && result.error.includes('daily limit')) {
          smtpExhausted = true;
          console.warn(`⏸️ SMTP daily limit reached for user ${userId}. Remaining leads will be retried tomorrow.`);
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    return NextResponse.json({ success: true, summary: { total: leadsToProcess.length, successful: successCount, failed: failureCount, smtpExhausted } });
  } catch (error: any) {
    logDetailedError('CRON_EMAIL_AUTOMATION_GET_FAILED', error, {
      route: '/api/cron/email-automation'
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}