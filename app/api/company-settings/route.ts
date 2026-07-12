import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET - Load company settings (user-specific or default)
 */
export async function GET(request: NextRequest) {
  try {
    // Get userId from query or header
    const queryUserId = request.nextUrl.searchParams.get('userId');
    const headerUserId = request.headers.get('x-user-id');
    const userId = queryUserId || headerUserId || null;

    let settings: any = null;

    // Try to get user-specific settings first
    if (userId) {
      settings = await prisma.companySettings.findUnique({
        where: { userId: userId }
      });
      console.log(`🔍 User-specific company settings lookup for userId: ${userId} - ${settings ? 'FOUND' : 'NOT FOUND'}`);
    }

    // Fallback to default settings if no user-specific settings found
    let defaultSettings: any = null;
    if (!settings) {
      defaultSettings = await prisma.companySettings.findFirst({
        where: { type: 'default' }
      });
      console.log(`🔍 Global company settings lookup - ${defaultSettings ? 'FOUND' : 'NOT FOUND'}`);
    }

    if (!settings && !defaultSettings) {
      // Create default settings if none exist
      const defaultEmailTimings = [
        { stage: 'called_once', delay: 0, unit: 'minutes', description: 'Send immediately' },
        { stage: 'called_twice', delay: 7, unit: 'days', description: 'Send after 7 days' },
        { stage: 'called_three_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
        { stage: 'called_four_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
        { stage: 'called_five_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
        { stage: 'called_six_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
        { stage: 'called_seven_times', delay: 7, unit: 'days', description: 'Send after 7 days' }
      ];

      defaultSettings = await prisma.companySettings.create({
        data: {
          type: 'default',
          companyName: 'QuasarLeads',
          service: 'AI-powered lead generation',
          industry: 'Technology',
          senderName: 'QuasarLeads Team',
          senderEmail: process.env.GMAIL_USER || 'info@quasarseo.nl',
          websiteUrl: 'https://quasarleads.com',
          logoUrl: '',
          defaultOutreachRecipient: 'lead',
          defaultSenderIdentity: 'company',
          emailTimings: defaultEmailTimings,
        }
      });
    }

    // If userId provided but no user-specific settings exist, seed a new doc from defaults
    if (userId && !settings) {
      const seed = defaultSettings || await prisma.companySettings.findFirst({ where: { type: 'default' } });

      settings = await prisma.companySettings.upsert({
        where: { userId: userId },
        update: {},
        create: {
          userId: userId,
          companyName: seed?.companyName || 'QuasarLeads',
          service: seed?.service || 'AI-powered lead generation',
          industry: seed?.industry || '',
          senderName: seed?.senderName || 'QuasarLeads Team',
          senderEmail: seed?.senderEmail || (process.env.GMAIL_USER || 'info@quasarseo.nl'),
          websiteUrl: seed?.websiteUrl || 'https://quasarleads.com',
          logoUrl: seed?.logoUrl || '',
          defaultOutreachRecipient: seed?.defaultOutreachRecipient || 'lead',
          defaultSenderIdentity: seed?.defaultSenderIdentity || 'company',
          emailTimings: seed?.emailTimings || [],
        }
      });
    }

    // Choose the response settings: user-specific if present, otherwise default
    const responseSettings = settings || defaultSettings;

    // Remove internal fields for client consumption
    const { id, type, userId: settingsUserId, createdAt, updatedAt, ...cleanSettings } = responseSettings;

    return NextResponse.json({
      success: true,
      settings: cleanSettings,
      isUserSpecific: !!settingsUserId
    });

  } catch (error: any) {
    console.error('Error loading company settings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to load company settings'
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Save company settings (user-specific)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      companyName,
      service,
      industry,
      senderName,
      senderEmail,
      websiteUrl,
      logoUrl,
      emailTimings,
      defaultOutreachRecipient,
      defaultSenderIdentity
    } = body;

    const effectiveUserId = userId || request.headers.get('x-user-id');

    // Validate required fields
    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required for user-specific settings' },
        { status: 400 }
      );
    }

    if (!companyName || !service) {
      return NextResponse.json(
        { success: false, error: 'Company name and service are required' },
        { status: 400 }
      );
    }

    // Update or create user-specific settings
    const updatedSettings = await prisma.companySettings.upsert({
      where: { userId: effectiveUserId },
      update: {
        companyName,
        service,
        industry: industry || '',
        senderName: senderName || companyName,
        senderEmail: senderEmail || process.env.GMAIL_USER || 'info@quasarseo.nl',
        websiteUrl: websiteUrl || '',
        logoUrl: logoUrl || '',
        defaultOutreachRecipient: ['lead', 'company'].includes(defaultOutreachRecipient) ? defaultOutreachRecipient : 'lead',
        defaultSenderIdentity: ['company', 'author'].includes(defaultSenderIdentity) ? defaultSenderIdentity : 'company',
        emailTimings: emailTimings || [
          { stage: 'called_once', delay: 0, unit: 'minutes', description: 'Send immediately' },
          { stage: 'called_twice', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_three_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_four_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_five_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_six_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_seven_times', delay: 7, unit: 'days', description: 'Send after 7 days' }
        ],
        updatedAt: new Date(),
      },
      create: {
        userId: effectiveUserId,
        companyName,
        service,
        industry: industry || '',
        senderName: senderName || companyName,
        senderEmail: senderEmail || process.env.GMAIL_USER || 'info@quasarseo.nl',
        websiteUrl: websiteUrl || '',
        logoUrl: logoUrl || '',
        defaultOutreachRecipient: ['lead', 'company'].includes(defaultOutreachRecipient) ? defaultOutreachRecipient : 'lead',
        defaultSenderIdentity: ['company', 'author'].includes(defaultSenderIdentity) ? defaultSenderIdentity : 'company',
        emailTimings: emailTimings || [
          { stage: 'called_once', delay: 0, unit: 'minutes', description: 'Send immediately' },
          { stage: 'called_twice', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_three_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_four_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_five_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_six_times', delay: 7, unit: 'days', description: 'Send after 7 days' },
          { stage: 'called_seven_times', delay: 7, unit: 'days', description: 'Send after 7 days' }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    return NextResponse.json({
      success: true,
      message: `User-specific company settings saved successfully for userId: ${effectiveUserId}`,
      settings: updatedSettings,
      isUserSpecific: true
    });

  } catch (error: any) {
    console.error('Error saving company settings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to save company settings'
      },
      { status: 500 }
    );
  }
} 