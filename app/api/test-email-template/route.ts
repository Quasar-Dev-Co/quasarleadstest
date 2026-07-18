import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';
import { getApiKeysFromCredentials, appendEnvKey } from '@/lib/api-key-rotation';
import OpenAI from 'openai';

const EMAIL_GENERATION_MODEL = 'gpt-5.4-nano';

// Resolve the user's OpenAI key (per-user credentials first, then env fallback)
async function resolveOpenAiKeyForUser(userId: string): Promise<string> {
  let credentialKeys: string[] = [];
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credentials: true }
    });

    credentialKeys = getApiKeysFromCredentials(
      (user?.credentials as Record<string, any>) || {},
      'OPENAI_API_KEY',
      'OPENAI_ACCOUNTS'
    );
  } catch (err) {
    console.warn('Failed to load user OpenAI credentials:', err);
  }

  const keys = appendEnvKey(credentialKeys, process.env.OPENAI_API_KEY);
  return keys[0] || '';
}

// Replace template variables with test lead / company values
function replaceVariables(content: string, testLead: any, companySettings: any, customVariables?: Record<string, string>): string {
  const variables: Record<string, string> = {
    '{{NAME}}': testLead.name || 'Test Lead',
    '{{LEAD_NAME}}': testLead.name || 'Test Lead',
    '{{OWNER_NAME}}': testLead.name || 'Test Lead',
    '{{COMPANY_NAME}}': testLead.company || 'Test Company',
    '{{COMPANY_REVIEW}}': '4.5 stars with 127 positive reviews',
    '{{INTEREST_KEYWORDS}}': '',
    '{{LEAD_LINKEDIN}}': '',
    '{{COMPANY_LINKEDIN}}': '',
    '{{LOCATION}}': 'Test Location',
    '{{EMAIL}}': 'test@example.com',
    '{{SENDER_NAME}}': companySettings.senderName || 'QuasarLeads Team',
    '{{SENDER_EMAIL}}': companySettings.senderEmail || '',
    '{{COMPANY_SERVICE}}': companySettings.service || 'AI-powered lead generation',
    '{{TARGET_INDUSTRY}}': companySettings.industry || 'Technology',
    '{{WEBSITE_URL}}': companySettings.websiteUrl || 'https://quasarleads.com',
    '{{SERVICE_NAME}}': '',
    '{{LOCATION_NAME}}': ''
  };

  // Merge in user-supplied custom variable test values (overrides defaults)
  if (customVariables && typeof customVariables === 'object') {
    Object.entries(customVariables).forEach(([key, value]) => {
      if (typeof key === 'string' && typeof value === 'string') {
        variables[key] = value;
      }
    });
  }

  let result = content;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
    result = result.replace(regex, value || '');
  });
  return result;
}

// Generate email body HTML from the contentPrompt using OpenAI (mirrors cron behavior)
async function generateContentFromPrompt(
  prompt: string,
  testLead: any,
  companySettings: any,
  stage: string,
  apiKey: string,
  customVariables?: Record<string, string>
): Promise<string> {
  if (!apiKey) {
    // No API key available - fall back to using the prompt as the body so the test still sends
    return `<p>${(prompt || '').replace(/\n/g, '<br>')}</p>`;
  }

  const openai = new OpenAI({ apiKey });
  const stageLabel = String(stage || '').replace(/_/g, ' ');

  const systemPrompt = `You are an expert B2B outbound email copywriter.
Return ONLY valid HTML body content (no markdown, no code fences, no subject, no signature).
Write concise, personalized, high-converting emails with clear value and one CTA.
Use short paragraphs and professional, natural tone.`;

  const aiPrompt = `Use this template guidance as the main instruction:
${prompt}

Lead context:
- Lead name: ${testLead?.name || ''}
- Company: ${testLead?.company || ''}
- Stage: ${stageLabel}
- Interest keywords: ${customVariables?.['{{INTEREST_KEYWORDS}}'] || 'N/A'}
- Lead LinkedIn: ${customVariables?.['{{LEAD_LINKEDIN}}'] || 'N/A'}
- Company LinkedIn: ${customVariables?.['{{COMPANY_LINKEDIN}}'] || 'N/A'}

Sender/business context:
- Service: ${companySettings?.service || 'AI-powered lead generation'}
- Target industry: ${companySettings?.industry || 'Technology'}
- Website URL: ${companySettings?.websiteUrl || 'https://quasarleads.com'}
- Sender name placeholder: {{SENDER_NAME}}

Hard requirements:
1) Include these placeholders naturally if relevant: {{LEAD_NAME}}, {{COMPANY_NAME}}, {{COMPANY_REVIEW}}, {{INTEREST_KEYWORDS}}, {{LEAD_LINKEDIN}}, {{COMPANY_LINKEDIN}}, {{SENDER_NAME}}, {{COMPANY_SERVICE}}, {{TARGET_INDUSTRY}}
2) Keep it specific and meaningful (not generic filler)
3) Return only the HTML body content.`;

  try {
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
      console.warn('Test email: OpenAI responses.create failed, trying chat completions:', responsesError?.message);
    }

    // Fallback to chat completions for compatibility
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

    // Strip code fences if present
    generatedContent = generatedContent.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
    return generatedContent;
  } catch (error: any) {
    console.warn('Test email: AI content generation failed, using prompt as body:', error?.message);
    return `<p>${(prompt || '').replace(/\n/g, '<br>')}</p>`;
  }
}

// Assemble the final HTML email from modular components (mirrors cron assembleFinalEmail)
async function assembleFinalEmail(
  template: any,
  testLead: any,
  companySettings: any,
  apiKey: string,
  customVariables?: Record<string, string>
): Promise<{ htmlContent: string; textContent: string }> {
  let finalHTML = '';
  let finalText = '';

  if (template.contentPrompt && template.contentPrompt.trim()) {
    // New modular format: generate content from prompt, then append media + signature
    const generatedContent = await generateContentFromPrompt(
      template.contentPrompt,
      testLead,
      companySettings,
      template.stage || 'test',
      apiKey,
      customVariables
    );

    const processedContent = replaceVariables(generatedContent, testLead, companySettings, customVariables);
    const processedSignature = (template.emailSignature && template.emailSignature.trim())
      ? replaceVariables(template.emailSignature, testLead, companySettings, customVariables)
      : '';
    const processedMediaLinks = (template.mediaLinks && template.mediaLinks.trim())
      ? replaceVariables(template.mediaLinks, testLead, companySettings, customVariables)
      : '';

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
    // Legacy format: use htmlContent/textContent directly
    finalHTML = replaceVariables(template.htmlContent || '', testLead, companySettings, customVariables);
    finalText = replaceVariables(template.textContent || '', testLead, companySettings, customVariables);
  }

  return { htmlContent: finalHTML, textContent: finalText };
}

export async function POST(request: NextRequest) {
  try {
    const { template, testEmail, testLead, companySettings, userId, customVariables } = await request.json();
    if (!userId || !template || !testEmail) {
      return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const creds = (user?.credentials as any) || {};
    if (!creds.SMTP_HOST || !creds.SMTP_USER || !creds.SMTP_PASSWORD) {
      return NextResponse.json({ success: false, error: 'SMTP not configured' }, { status: 400 });
    }

    // Assemble the final email body from modular components (or legacy htmlContent)
    const apiKey = await resolveOpenAiKeyForUser(userId);
    const { htmlContent, textContent } = await assembleFinalEmail(template, testLead, companySettings, apiKey, customVariables);

    if (!htmlContent || !htmlContent.trim()) {
      return NextResponse.json({ success: false, error: 'Email body is empty. Please add content to the template first.' }, { status: 400 });
    }

    const subject = template.subject
      ? replaceVariables(template.subject, testLead, companySettings, customVariables)
      : 'Test Email';

    const result = await emailService.sendEmailForUser(userId, {
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
      leadId: 'test-lead',
      stage: template.stage || 'test'
    });

    return NextResponse.json({ success: result.success, messageId: result.messageId, error: result.error });
  } catch (error: any) {
    console.error('Test email error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
