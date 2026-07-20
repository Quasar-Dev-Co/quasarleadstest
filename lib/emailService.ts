import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { selectSmtpAccountForSending, incrementSmtpSentCount, SMTP_DAILY_LIMIT_PER_ACCOUNT, SelectedSmtpAccount } from '@/lib/smtp-rotation';
import { createEmailTracking, injectTrackingPixel } from '@/lib/email-tracking';

export interface EmailTemplate {
  subject: string;
  htmlContent: string;
  textContent: string;
}

export interface EmailConfig {
  to: string;
  subject: string;
  html: string;
  text: string;
  leadId?: string;
  stage?: string;
  fromName?: string;
  fromEmail?: string;
}

// Default email templates (built-in fallback)
const DEFAULT_EMAIL_TEMPLATES = {
  called_once: {
    subject: "Quick question about {{COMPANY_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>I came across {{COMPANY_NAME}} while researching companies in your space and was genuinely impressed by what you're doing.</p>
        <p>I have a quick question - are you currently happy with how you're finding new customers? I ask because I've been helping similar companies discover some really interesting opportunities they didn't know existed.</p>
        <p>No sales pitch here, just wondering if you'd be open to a brief chat about what's working (or not working) for {{COMPANY_NAME}} right now?</p>
        <p>If you're interested, just reply and let me know a good time for a quick call this week.</p>
        <p>Best,<br>{{SENDER_NAME}}<br>{{SENDER_EMAIL}}</p>
        <p style="color: #666; font-size: 12px;">P.S. If this isn't relevant, no worries - just let me know and I won't follow up.</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nI came across {{COMPANY_NAME}} while researching companies in your space and was genuinely impressed by what you're doing.\n\nI have a quick question - are you currently happy with how you're finding new customers? I ask because I've been helping similar companies discover some really interesting opportunities they didn't know existed.\n\nNo sales pitch here, just wondering if you'd be open to a brief chat about what's working (or not working) for {{COMPANY_NAME}} right now?\n\nIf you're interested, just reply and let me know a good time for a quick call this week.\n\nBest,\n{{SENDER_NAME}}\n{{SENDER_EMAIL}}\n\nP.S. If this isn't relevant, no worries - just let me know and I won't follow up.`
  },
  called_twice: {
    subject: "Following up on my message to {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>I sent you a message last week about {{COMPANY_NAME}} and wanted to follow up briefly.</p>
        <p>I realize you're probably busy, but I thought you might find this interesting: I recently helped a company very similar to yours increase their customer acquisition by 3x in just 30 days.</p>
        <p>The approach we used was pretty simple but most companies don't know about it.</p>
        <p>Would you be curious to hear how they did it? Takes about 10 minutes to explain.</p>
        <p>Let me know if you'd like to hear the story - I think it could be relevant for {{COMPANY_NAME}}.</p>
        <p>Thanks,<br>{{SENDER_NAME}}</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nI sent you a message last week about {{COMPANY_NAME}} and wanted to follow up briefly.\n\nI realize you're probably busy, but I thought you might find this interesting: I recently helped a company very similar to yours increase their customer acquisition by 3x in just 30 days.\n\nThe approach we used was pretty simple but most companies don't know about it.\n\nWould you be curious to hear how they did it? Takes about 10 minutes to explain.\n\nLet me know if you'd like to hear the story - I think it could be relevant for {{COMPANY_NAME}}.\n\nThanks,\n{{SENDER_NAME}}`
  },
  called_three_times: {
    subject: "One more try - {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>I've reached out a couple times now and haven't heard back, so I'll make this quick.</p>
        <p>I get it - you're probably getting tons of emails from people trying to sell you stuff. This isn't that.</p>
        <p>Simple question: What's the biggest challenge {{COMPANY_NAME}} is facing with getting new customers right now?</p>
        <p>I ask because the companies I work with usually mention one of these:</p>
        <ul>
          <li>Finding qualified prospects takes too much time</li>
          <li>Marketing campaigns aren't generating quality leads</li>
          <li>Hard to get people to respond to outreach</li>
          <li>Too expensive to acquire new customers</li>
        </ul>
        <p>If any of those sound familiar, I might have some ideas that could help.</p>
        <p>If not, no worries - just let me know you're all set and I'll stop reaching out.</p>
        <p>{{SENDER_NAME}}</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nI've reached out a couple times now and haven't heard back, so I'll make this quick.\n\nI get it - you're probably getting tons of emails from people trying to sell you stuff. This isn't that.\n\nSimple question: What's the biggest challenge {{COMPANY_NAME}} is facing with getting new customers right now?\n\nI ask because the companies I work with usually mention one of these:\n- Finding qualified prospects takes too much time\n- Marketing campaigns aren't generating quality leads\n- Hard to get people to respond to outreach\n- Too expensive to acquire new customers\n\nIf any of those sound familiar, I might have some ideas that could help.\n\nIf not, no worries - just let me know you're all set and I'll stop reaching out.\n\n{{SENDER_NAME}}`
  },
  called_four_times: {
    subject: "Thought you might find this interesting - {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>Quick story that might interest you...</p>
        <p>Last month I was talking to the CEO of a company that does something similar to {{COMPANY_NAME}}. They were frustrated because their competitors were somehow getting all the good customers while they were struggling to get noticed.</p>
        <p>Turns out, their competitors were using a strategy they'd never heard of to identify companies that were actively looking for their services. Within 6 weeks, they went from struggling to having more qualified prospects than they could handle.</p>
        <p>I won't share the details here (it's their competitive advantage), but if you're curious how they did it, I could walk you through it on a quick call.</p>
        <p>Might be relevant for {{COMPANY_NAME}} - or might not. Only one way to find out.</p>
        <p>Interested?</p>
        <p>{{SENDER_NAME}}</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nQuick story that might interest you...\n\nLast month I was talking to the CEO of a company that does something similar to {{COMPANY_NAME}}. They were frustrated because their competitors were somehow getting all the good customers while they were struggling to get noticed.\n\nTurns out, their competitors were using a strategy they'd never heard of to identify companies that were actively looking for their services. Within 6 weeks, they went from struggling to having more qualified prospects than they could handle.\n\nThe interesting part? It had nothing to do with traditional marketing or advertising.\n\nI won't share the details here (it's their competitive advantage), but if you're curious how they did it, I could walk you through it on a quick call.\n\nMight be relevant for {{COMPANY_NAME}} - or might not. Only one way to find out.\n\nInterested?\n\n{{SENDER_NAME}}`
  },
  called_five_times: {
    subject: "Should I stop reaching out? - {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>I've sent you a few messages now and haven't heard back. Before I continue, I wanted to check in.</p>
        <p>Is this just bad timing, or should I stop reaching out about {{COMPANY_NAME}}?</p>
        <p>I ask because:</p>
        <ul>
          <li>Maybe customer acquisition isn't a priority right now</li>
          <li>Maybe you've already got it figured out</li>
          <li>Maybe my emails aren't reaching the right person</li>
          <li>Or maybe you're just swamped with other stuff</li>
        </ul>
        <p>If it's just timing and you'd like to connect down the road, let me know and I'll circle back in a few months.</p>
        <p>If you're all set and don't want me to keep reaching out, just reply "all set" and I'll remove you from my list.</p>
        <p>If you ARE interested in hearing about that strategy I mentioned, just reply "yes" and I'll send over some times we could chat.</p>
        <p>Either way, thanks for your time.</p>
        <p>{{SENDER_NAME}}</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nI've sent you a few messages now and haven't heard back. Before I continue, I wanted to check in.\n\nIs this just bad timing, or should I stop reaching out about {{COMPANY_NAME}}?\n\nI ask because:\n- Maybe customer acquisition isn't a priority right now\n- Maybe you've already got it figured out\n- Maybe my emails aren't reaching the right person\n- Or maybe you're just swamped with other stuff\n\nIf it's just timing and you'd like to connect down the road, let me know and I'll circle back in a few months.\n\nIf you're all set and don't want me to keep reaching out, just reply "all set" and I'll remove you from my list.\n\nIf you ARE interested in hearing about that strategy I mentioned, just reply "yes" and I'll send over some times we could chat.\n\nEither way, thanks for your time.\n\n{{SENDER_NAME}}`
  },
  called_six_times: {
    subject: "Last message from me - {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>This is my last email to you - I promise.</p>
        <p>Even though we haven't connected, I wanted to leave you with something useful.</p>
        <p>I put together a simple checklist that most companies find helpful for finding better customers. It's got:</p>
        <ul>
          <li>5 free tools for finding prospects</li>
          <li>Email templates that actually get responses</li>
          <li>A step-by-step process for reaching out</li>
          <li>How to track what's working and what isn't</li>
        </ul>
        <p>No catch, no signup required. Just something useful for {{COMPANY_NAME}}.</p>
        <p>If you want it, just reply "send it" and I'll email it over.</p>
        <p>If not, no worries. Best of luck with everything at {{COMPANY_NAME}}.</p>
        <p>{{SENDER_NAME}}</p>
        <p style="color: #666; font-size: 12px;">This really is my last email. Thanks for your patience with my outreach.</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nThis is my last email to you - I promise.\n\nEven though we haven't connected, I wanted to leave you with something useful.\n\nI put together a simple checklist that most companies find helpful for finding better customers. It's got:\n- 5 free tools for finding prospects\n- Email templates that actually get responses\n- A step-by-step process for reaching out\n- How to track what's working and what isn't\n\nNo catch, no signup required. Just something useful for {{COMPANY_NAME}}.\n\nIf you want it, just reply "send it" and I'll email it over.\n\nIf not, no worries. Best of luck with everything at {{COMPANY_NAME}}.\n\n{{SENDER_NAME}}\n\nThis really is my last email. Thanks for your patience with my outreach.`
  },
  called_seven_times: {
    subject: "Okay, I lied - one more message {{LEAD_NAME}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Hi {{LEAD_NAME}},</p>
        <p>I know I said my last email was my last email, but I couldn't resist one final attempt.</p>
        <p>Here's the thing - I've been doing this for a while, and I've learned that sometimes the best opportunities come from the people who take the longest to respond.</p>
        <p>Maybe you've been busy. Maybe my emails got lost in your inbox. Maybe you were waiting to see how persistent I'd be. 😄</p>
        <p>Either way, I figured I'd give it one more shot with a simple question:</p>
        <p><strong>What would have to be true for you to take 15 minutes to learn about a new way to find customers for {{COMPANY_NAME}}?</strong></p>
        <p>If the answer is "nothing" - totally fair. Just reply "remove me" and I'll stop.</p>
        <p>But if there's any scenario where you'd be curious to learn something new that could help {{COMPANY_NAME}}, just reply "maybe" and I'll share one specific thing you could try this week.</p>
        <p>That's it. No long sales call, no complicated proposal. Just one thing you could test.</p>
        <p>Sound fair?</p>
        <p>{{SENDER_NAME}}</p>
        <p style="color: #666; font-size: 12px;">Okay, THIS is really the last one. 😊</p>
      </div>
    `,
    textContent: `Hi {{LEAD_NAME}},\n\nI know I said my last email was my last email, but I couldn't resist one final attempt.\n\nHere's the thing - I've been doing this for a while, and I've learned that sometimes the best opportunities come from the people who take the longest to respond.\n\nMaybe you've been busy. Maybe my emails got lost in your inbox. Maybe you were waiting to see how persistent I'd be. 😄\n\nEither way, I figured I'd give it one more shot with a simple question:\n\nWhat would have to be true for you to take 15 minutes to learn about a new way to find customers for {{COMPANY_NAME}}?\n\nIf the answer is "nothing" - totally fair. Just reply "remove me" and I'll stop.\n\nBut if there's any scenario where you'd be curious to learn something new that could help {{COMPANY_NAME}}, just reply "maybe" and I'll share one specific thing you could try this week.\n\nThat's it. No long sales call, no complicated proposal. Just one thing you could test.\n\nSound fair?\n\n{{SENDER_NAME}}\n\nOkay, THIS is really the last one. 😊`
  }
};

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Initialize with a placeholder transporter; per-send we will build from user credentials
    this.transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  // Build transporter from user's SMTP credentials with daily-limit rotation
  private async buildTransporterForUser(userId: string): Promise<SelectedSmtpAccount> {
    const result = await selectSmtpAccountForSending(userId);

    if (!result.ok) {
      if (result.reason === 'all_exhausted') {
        throw new Error(`All SMTP accounts have reached their daily limit of ${SMTP_DAILY_LIMIT_PER_ACCOUNT} emails. Emails will resume tomorrow.`);
      }
      throw new Error(result.errors.join(' || '));
    }

    return result.account;
  }

  // Replace template variables with actual values
  private replaceTemplateVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    });
    return result;
  }

  // Get email template for specific stage (checks database first, then defaults)
  async getEmailTemplate(stage: string, userId?: string): Promise<EmailTemplate | null> {
    const validStages = ['called_once', 'called_twice', 'called_three_times', 'called_four_times', 'called_five_times', 'called_six_times', 'called_seven_times'];
    if (!validStages.includes(stage)) {
      console.error(`Invalid email stage: ${stage}`);
      return null;
    }

    try {
      // 1. Try user-specific template
      if (userId) {
        const templateForUser = await prisma.emailTemplate.findUnique({
          where: {
            stage_userId: {
              stage: stage,
              userId: userId
            }
          }
        });

        if (templateForUser && templateForUser.isActive) {
          console.log(`✅ Using user-specific template for stage: ${stage}`);
          return {
            subject: templateForUser.subject,
            htmlContent: templateForUser.htmlContent,
            textContent: templateForUser.textContent || ''
          };
        }
      }

      // 2. Try global template (userId is null)
      const globalTemplate = await prisma.emailTemplate.findFirst({
        where: {
          stage: stage,
          isActive: true,
          userId: null
        }
      });

      if (globalTemplate) {
        console.log(`✅ Using global template for stage: ${stage}`);
        return {
          subject: globalTemplate.subject,
          htmlContent: globalTemplate.htmlContent,
          textContent: globalTemplate.textContent || ''
        };
      }

      // 3. Fall back to built-in default template
      console.log(`⚠️ Using built-in default template for stage: ${stage} (no DB template found)`);
      return DEFAULT_EMAIL_TEMPLATES[stage as keyof typeof DEFAULT_EMAIL_TEMPLATES];

    } catch (error) {
      console.warn(`❌ Error loading custom template for ${stage}, using default:`, error);
      return DEFAULT_EMAIL_TEMPLATES[stage as keyof typeof DEFAULT_EMAIL_TEMPLATES];
    }
  }

  // Send email with template
  async sendEmail(config: EmailConfig): Promise<{ success: boolean; messageId?: string; error?: string; trackingId?: string }> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: any = null;

    while (retryCount < maxRetries) {
      try {
        console.log(`📧 Attempt ${retryCount + 1}/${maxRetries} to send email to: ${config.to}`);

        if (!config.to || !config.subject || !config.html) {
          const error = 'Missing required email configuration (to, subject, or html)';
          console.error(error);
          return { success: false, error };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(config.to)) {
          return { success: false, error: `Invalid email address: ${config.to}` };
        }

        const senderName = config.fromName || process.env.SENDER_NAME || 'QuasarLeads Team';
        const senderEmail = config.fromEmail || (this.transporter as any)?.options?.auth?.user || 'no-reply@example.com';

        // Inject tracking pixel if leadId is provided
        let htmlWithTracking = config.html;
        let trackingId = '';
        if (config.leadId) {
          trackingId = await createEmailTracking({
            leadId: config.leadId,
            stage: config.stage,
            recipientEmail: config.to,
            subject: config.subject,
          });
          if (trackingId) {
            htmlWithTracking = injectTrackingPixel(config.html, trackingId);
          }
        }

        const info = await this.transporter.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to: config.to,
          subject: config.subject,
          text: config.text || htmlWithTracking.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          html: htmlWithTracking,
          headers: {
            'List-Unsubscribe': `<mailto:${senderEmail}?subject=Unsubscribe>`,
            'List-Unsubscribe-Posting': 'List-Unsubscribe=One-Click',
            'X-Auto-Response-Suppress': 'All',
            'Auto-Submitted': 'auto-replied',
          },
        });

        if (!info.messageId || !info.messageId.includes('@')) {
          throw new Error('Invalid message ID received from SMTP server');
        }

        console.log('✅ Email sent successfully! Message ID:', info.messageId);
        return { success: true, messageId: info.messageId, trackingId };

      } catch (error: any) {
        lastError = error;
        console.error(`❌ Email sending failed (attempt ${retryCount + 1}/${maxRetries}):`, error);

        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;

        if (retryCount === maxRetries) {
          return { success: false, error: `Failed after ${maxRetries} attempts: ${error.message}` };
        }
      }
    }

    return { success: false, error: `Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}` };
  }

  // Send email using a specific user's SMTP credentials
  async sendEmailForUser(userId: string, config: EmailConfig): Promise<{ success: boolean; messageId?: string; error?: string; trackingId?: string }> {
    try {
      const smtpAccount = await this.buildTransporterForUser(userId);
      const originalTransporter = this.transporter;
      this.transporter = smtpAccount.transporter;
      const result = await this.sendEmail(config);
      this.transporter = originalTransporter;

      if (result.success) {
        await incrementSmtpSentCount(userId, smtpAccount.SMTP_USER, smtpAccount.SMTP_HOST);
      }

      return result;
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to configure SMTP' };
    }
  }

  // Send automated email based on CRM stage
  async sendStageEmail(
    leadData: {
      name: string;
      email: string;
      company: string;
      stage: string;
      senderOverride?: string;
      leadId?: string;
      searchService?: string;
      searchLocation?: string;
      interestKeywords?: string | null;
      linkedinProfile?: string | null;
      companyLinkedin?: string | null;
    },
    userId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string; trackingId?: string }> {

    console.log(`🎯 Sending stage email for lead: ${leadData.name} - Stage: ${leadData.stage}`);

    const template = await this.getEmailTemplate(leadData.stage, userId);
    if (!template) {
      return { success: false, error: `No email template found for stage: ${leadData.stage}` };
    }

    let companySettings = {} as any;
    try {
      if (userId) {
        companySettings = await prisma.companySettings.findUnique({ where: { userId } });
      }

      if (!companySettings || Object.keys(companySettings).length === 0) {
        companySettings = await prisma.companySettings.findFirst({ where: { type: 'default' } });
      }
    } catch (error) {
      console.warn('❌ Could not load companySettings from Prisma:', error);
    }

    const variables = {
      LEAD_NAME: leadData.name,
      COMPANY_NAME: leadData.company,
      INTEREST_KEYWORDS: leadData.interestKeywords || '',
      LEAD_LINKEDIN: leadData.linkedinProfile || '',
      COMPANY_LINKEDIN: leadData.companyLinkedin || '',
      SENDER_NAME: leadData.senderOverride || companySettings?.senderName || process.env.SENDER_NAME || 'QuasarLeads Team',
      SENDER_EMAIL: companySettings?.senderEmail || 'info@quasarseo.nl',
      COMPANY_SERVICE: companySettings?.service || 'AI-powered lead generation',
      WEBSITE_URL: companySettings?.websiteUrl || 'https://quasarleads.com',
      SERVICE_NAME: leadData.searchService || '',
      LOCATION_NAME: leadData.searchLocation || ''
    };

    const subject = this.replaceTemplateVariables(template.subject, variables);
    const htmlContent = this.replaceTemplateVariables(template.htmlContent, variables);
    const textContent = this.replaceTemplateVariables(template.textContent, variables);

    const emailPayload = {
      to: leadData.email,
      subject,
      html: htmlContent,
      text: textContent,
      stage: leadData.stage,
      leadId: leadData.leadId,
    };

    if (userId) {
      return await this.sendEmailForUser(userId, emailPayload);
    }
    return await this.sendEmail(emailPayload);
  }

  // Test email connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Connection test failed' };
    }
  }
}

export const emailService = new EmailService();
export default EmailService;
