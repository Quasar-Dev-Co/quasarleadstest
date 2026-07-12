import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET: Fetches AI settings configuration for authenticated user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get userId from Authorization header
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User authentication required'
      }, { status: 401 });
    }

    // Get user-specific settings
    let settings = await prisma.aISettings.findUnique({
      where: { userId: userId }
    });

    // If no settings exist for this user, create default ones
    if (!settings) {
      settings = await prisma.aISettings.create({
        data: { userId: userId }
      });
    }

    if (!settings) {
      throw new Error('Failed to create or retrieve user settings');
    }

    return NextResponse.json({
      success: true,
      settings: {
        isEnabled: settings.isEnabled,
        autoReplyEnabled: settings.autoReplyEnabled,
        autoSendThreshold: settings.autoSendThreshold,
        defaultTone: settings.defaultTone,
        includeCompanyInfo: settings.includeCompanyInfo,
        maxResponseLength: settings.maxResponseLength,
        customInstructions: settings.customInstructions,
        responsePrompt: settings.responsePrompt,
        companyName: settings.companyName,
        senderName: settings.senderName,
        senderEmail: settings.senderEmail,
        signature: settings.signature
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching AI settings:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch AI settings'
    }, { status: 500 });
  }
}

/**
 * POST: Updates AI settings configuration for authenticated user.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get userId from Authorization header
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User authentication required'
      }, { status: 401 });
    }

    const body = await request.json();
    const {
      isEnabled,
      autoReplyEnabled,
      autoSendThreshold,
      defaultTone,
      includeCompanyInfo,
      maxResponseLength,
      customInstructions,
      responsePrompt,
      companyName,
      senderName,
      senderEmail,
      signature
    } = body;

    // Validation
    if (autoSendThreshold !== undefined && (autoSendThreshold < 0 || autoSendThreshold > 100)) {
      return NextResponse.json({
        success: false,
        error: 'Auto-send threshold must be between 0 and 100'
      }, { status: 400 });
    }

    if (maxResponseLength !== undefined && (maxResponseLength < 50 || maxResponseLength > 1000)) {
      return NextResponse.json({
        success: false,
        error: 'Max response length must be between 50 and 1000'
      }, { status: 400 });
    }

    // Update or create settings for this specific user
    const updatedSettings = await prisma.aISettings.upsert({
      where: { userId: userId },
      update: {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
        autoReplyEnabled: autoReplyEnabled !== undefined ? autoReplyEnabled : undefined,
        autoSendThreshold: autoSendThreshold !== undefined ? autoSendThreshold : undefined,
        defaultTone: defaultTone || undefined,
        includeCompanyInfo: includeCompanyInfo !== undefined ? includeCompanyInfo : undefined,
        maxResponseLength: maxResponseLength || undefined,
        customInstructions: customInstructions || undefined,
        responsePrompt: responsePrompt || undefined,
        companyName: companyName || undefined,
        senderName: senderName || undefined,
        senderEmail: senderEmail || undefined,
        signature: signature || undefined
      },
      create: {
        userId: userId,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        autoReplyEnabled: autoReplyEnabled !== undefined ? autoReplyEnabled : false,
        autoSendThreshold: autoSendThreshold || 85,
        defaultTone: defaultTone || 'professional',
        includeCompanyInfo: includeCompanyInfo !== undefined ? includeCompanyInfo : true,
        maxResponseLength: maxResponseLength || 300,
        customInstructions: customInstructions || '',
        responsePrompt: responsePrompt || `You are a calm, engaged entrepreneur who truly listens to potential clients. Respond to incoming emails with warmth and genuine attention, without any sales pressure. Your goal is to create real connection and trust.

CORE PRINCIPLES:
- Use short, warm sentences
- Avoid any form of pushy or commercial language
- Respond with genuine attention to what someone says
- Show understanding and recognition
- Make it clear you're there to help and brainstorm, not to sell
- Sound like a real entrepreneur, not a robot
- Create space for feeling, vulnerability, and trust

STRICT STRUCTURE (Follow this format EXACTLY):
1. Begin with warm acknowledgment of their message
2. Ask ONE open, soft follow-up question like:
   - "What caught your attention the most in what I shared?"
   - "Where are you currently focusing your efforts with your online visibility?"
   - "What's on your mind when it comes to your growth or marketing strategies right now?"
3. If it feels natural, suggest a casual Zoom call:
   "Maybe it would be helpful to take a look at this together. I'd love to offer some ideas in a casual Zoom call, no pressure at all."
4. End with a friendly, open tone:
   - "No rush — just let me know what feels right for you."
   - "I look forward to hearing from you when you're ready."
   - "Feel free to just drop me an email whenever you're ready to continue the conversation."

IMPORTANT:
- If the client asks for an appointment or booking, give ONLY this link: https://booking.quasarleads.com/${userId}
- NEVER ask for dates or times for appointments
- Just send the link without further instructions
- Always end with "Warmly, Team QuasarSEO"

Follow this format PERFECTLY. No exceptions. Be warm, human, and inviting without any sales pressure.`,
        companyName: companyName || 'QuasarSEO',
        senderName: senderName || 'Team QuasarSEO',
        senderEmail: senderEmail || 'info@quasarseo.nl',
        signature: signature || 'Warmly,\nTeam QuasarSEO'
      }
    });

    console.log(`✅ AI settings updated successfully for user: ${userId}`);

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      message: 'AI settings updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error updating AI settings:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update AI settings'
    }, { status: 500 });
  }
} 