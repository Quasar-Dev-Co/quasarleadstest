import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/emailService';
import { getApiKeysFromCredentials, appendEnvKey } from '@/lib/api-key-rotation';
import OpenAI from 'openai';

const EMAIL_GENERATION_MODEL = 'gpt-5.4-nano';

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

// Build the variable map from the lead's actual data
function buildVariablesFromLead(lead: any, companySettings: any): Record<string, string> {
  const authInfo = (lead.authInformation as any) || {};
  const ownerName = authInfo.owner_name || lead.companyOwner || authInfo.executive_name || lead.name || 'there';

  return {
    '{{NAME}}': lead.name || '',
    '{{LEAD_NAME}}': lead.name || '',
    '{{OWNER_NAME}}': ownerName,
    '{{COMPANY_NAME}}': lead.company || '',
    '{{COMPANY_REVIEW}}': lead.rating ? `${lead.rating} stars${lead.reviews ? ` with ${lead.reviews} reviews` : ''}` : '',
    '{{INTEREST_KEYWORDS}}': authInfo.interest_keywords || '',
    '{{LEAD_LINKEDIN}}': lead.linkedinProfile || '',
    '{{COMPANY_LINKEDIN}}': authInfo.company_linkedin || '',
    '{{LOCATION}}': lead.location || '',
    '{{LOCATION_NAME}}': lead.location || '',
    '{{EMAIL}}': lead.email || '',
    '{{SENDER_NAME}}': companySettings?.senderName || 'QuasarSEO Team',
    '{{SENDER_EMAIL}}': companySettings?.senderEmail || '',
    '{{COMPANY_SERVICE}}': companySettings?.service || 'AI-powered lead generation',
    '{{TARGET_INDUSTRY}}': companySettings?.industry || 'Technology',
    '{{WEBSITE_URL}}': companySettings?.websiteUrl || '',
    '{{SERVICE_NAME}}': companySettings?.service || '',
  };
}

function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

async function generateContentFromPrompt(
  prompt: string,
  lead: any,
  companySettings: any,
  stage: string,
  apiKey: string,
  variables: Record<string, string>
): Promise<string> {
  if (!apiKey) {
    return `<p>${(prompt || '').replace(/\n/g, '<br>')}</p>`;
  }

  const openai = new OpenAI({ apiKey });
  const stageLabel = String(stage || '').replace(/_/g, ' ');
  const authInfo = (lead.authInformation as any) || {};

  const systemPrompt = `You are an expert B2B outbound email copywriter.
Return ONLY valid HTML body content (no markdown, no code fences, no subject, no signature).
Write concise, personalized, high-converting emails with clear value and one CTA.
Use short paragraphs and professional, natural tone.`;

  const aiPrompt = `Use this template guidance as the main instruction:
${prompt}

Lead context:
- Lead name: ${lead?.name || ''}
- Company: ${lead?.company || ''}
- Role/Title: ${authInfo.role || 'N/A'}
- Location: ${lead?.location || ''}
- Website: ${lead?.website || ''}
- Stage: ${stageLabel}
- Company review context: ${lead?.rating ? `${lead.rating} stars` : 'N/A'}${lead?.reviews ? `, ${lead.reviews} reviews` : ''}
- Interest keywords: ${authInfo.interest_keywords || 'N/A'}
- Lead LinkedIn: ${lead?.linkedinProfile || 'N/A'}
- Company LinkedIn: ${authInfo.company_linkedin || 'N/A'}

Sender/business context:
- Service: ${companySettings?.service || 'AI-powered lead generation'}
- Target industry: ${companySettings?.industry || 'Technology'}
- Website URL: ${companySettings?.websiteUrl || ''}
- Sender name: ${companySettings?.senderName || 'QuasarSEO Team'}

Hard requirements:
1) Write a personalized email using the lead's actual data above (name, company, role, interest keywords)
2) Keep it specific and meaningful (not generic filler)
3) Return only the HTML body content (no subject, no signature).`;

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
      console.warn('Test send: OpenAI responses.create failed, trying chat completions:', responsesError?.message);
    }

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

    if (!generatedContent) throw new Error('OpenAI returned empty email content');

    generatedContent = generatedContent.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
    return generatedContent;
  } catch (error: any) {
    console.warn('Test send: AI content generation failed, using prompt as body:', error?.message);
    return `<p>${(prompt || '').replace(/\n/g, '<br>')}</p>`;
  }
}

async function assembleFinalEmail(
  template: any,
  lead: any,
  companySettings: any,
  apiKey: string,
  variables: Record<string, string>
): Promise<{ htmlContent: string; textContent: string; subject: string }> {
  let finalHTML = '';
  let finalText = '';

  if (template.contentPrompt && template.contentPrompt.trim()) {
    const generatedContent = await generateContentFromPrompt(
      template.contentPrompt, lead, companySettings, template.stage || 'initial', apiKey, variables
    );
    const processedContent = replaceVariables(generatedContent, variables);
    const processedSignature = (template.emailSignature && template.emailSignature.trim())
      ? replaceVariables(template.emailSignature, variables) : '';
    const processedMediaLinks = (template.mediaLinks && template.mediaLinks.trim())
      ? replaceVariables(template.mediaLinks, variables) : '';

    finalHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 100%; margin: 0 auto; background: #ffffff;">
        <div style="padding: 20px; background: white;">
          ${processedContent}
          ${processedMediaLinks ? `<div style="margin: 40px 0; text-align: center; line-height: 0;">${processedMediaLinks}</div>` : ''}
          ${processedSignature ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; line-height: 1.5;">${processedSignature}</div>` : ''}
        </div>
      </div>`;
    finalText = `${processedContent.replace(/<[^>]*>/g, '')}\n\n${processedMediaLinks ? 'Media: ' + processedMediaLinks.replace(/<[^>]*>/g, '') + '\n\n' : ''}${processedSignature.replace(/<[^>]*>/g, '')}`;
  } else {
    finalHTML = replaceVariables(template.htmlContent || '', variables);
    finalText = replaceVariables(template.textContent || '', variables);
  }

  const subject = template.subject ? replaceVariables(template.subject, variables) : 'Test Email';
  return { htmlContent: finalHTML, textContent: finalText, subject };
}

export async function POST(request: NextRequest) {
  try {
    const { leadId, testEmail, userId, stage, sendEmail } = await request.json();

    if (!leadId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing leadId or userId' }, { status: 400 });
    }

    // Fetch the lead
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    // Fetch the user's company settings (credentials)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const creds = (user?.credentials as any) || {};
    const companySettings = {
      senderName: creds.SENDER_NAME || 'QuasarSEO Team',
      senderEmail: creds.SMTP_USER || '',
      service: creds.COMPANY_SERVICE || 'AI-powered lead generation',
      industry: creds.TARGET_INDUSTRY || 'Technology',
      websiteUrl: creds.WEBSITE_URL || '',
    };

    // Fetch the email template for the requested stage (default: first active template)
    let template: any = null;
    if (stage) {
      template = await prisma.emailTemplate.findFirst({
        where: { userId, stage, isActive: true },
      });
    }
    if (!template) {
      // Fall back to the first active template for this user (ordered by stage)
      template = await prisma.emailTemplate.findFirst({
        where: { userId, isActive: true },
        orderBy: { stage: 'asc' },
      });
    }
    if (!template) {
      return NextResponse.json({ success: false, error: 'No active email template found. Please create an email template first in Email Prompting.' }, { status: 404 });
    }

    // Build variables from the lead's actual data
    const variables = buildVariablesFromLead(lead, companySettings);

    // Generate the email content
    const apiKey = await resolveOpenAiKeyForUser(userId);
    const { htmlContent, textContent, subject } = await assembleFinalEmail(template, lead, companySettings, apiKey, variables);

    // If sendEmail is true, actually send the email
    let sendResult = null;
    if (sendEmail && testEmail) {
      if (!creds.SMTP_HOST || !creds.SMTP_USER || !creds.SMTP_PASSWORD) {
        return NextResponse.json({
          success: false,
          error: 'SMTP not configured. Please set up SMTP in Settings.',
          preview: { htmlContent, subject, leadEmail: lead.email }
        }, { status: 400 });
      }

      sendResult = await emailService.sendEmailForUser(userId, {
        to: testEmail,
        subject: `[TEST] ${subject}`,
        html: htmlContent,
        text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
        leadId: lead.id,
        stage: template.stage || 'test'
      });
    }

    return NextResponse.json({
      success: true,
      preview: {
        htmlContent,
        subject,
        leadEmail: lead.email,
        leadName: lead.name,
        leadCompany: lead.company,
        templateStage: template.stage,
      },
      sent: sendEmail && sendResult?.success,
      sendError: sendResult?.error || null,
    });
  } catch (error: any) {
    console.error('Test send email error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET endpoint to just preview without sending
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');
    const userId = searchParams.get('userId') || request.headers.get('x-user-id');
    const stage = searchParams.get('stage');

    if (!leadId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing leadId or userId' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const creds = (user?.credentials as any) || {};
    const companySettings = {
      senderName: creds.SENDER_NAME || 'QuasarSEO Team',
      senderEmail: creds.SMTP_USER || '',
      service: creds.COMPANY_SERVICE || 'AI-powered lead generation',
      industry: creds.TARGET_INDUSTRY || 'Technology',
      websiteUrl: creds.WEBSITE_URL || '',
    };

    let template: any = null;
    if (stage) {
      template = await prisma.emailTemplate.findFirst({
        where: { userId, stage, isActive: true },
      });
    }
    if (!template) {
      template = await prisma.emailTemplate.findFirst({
        where: { userId, isActive: true },
        orderBy: { stage: 'asc' },
      });
    }
    if (!template) {
      return NextResponse.json({ success: false, error: 'No active email template found.' }, { status: 404 });
    }

    const variables = buildVariablesFromLead(lead, companySettings);
    const apiKey = await resolveOpenAiKeyForUser(userId);
    const { htmlContent, subject } = await assembleFinalEmail(template, lead, companySettings, apiKey, variables);

    return NextResponse.json({
      success: true,
      preview: {
        htmlContent,
        subject,
        leadEmail: lead.email,
        leadName: lead.name,
        leadCompany: lead.company,
        templateStage: template.stage,
      },
    });
  } catch (error: any) {
    console.error('Test preview error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
