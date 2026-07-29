import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBatchOpenStats } from '@/lib/email-tracking';

/**
 * GET handler for retrieving leads with filtering, pagination, and server-side tab filtering
 *
 * Query params:
 *   userId    — required, scopes leads to this user
 *   tab       — 'new-leads' | 'processing-leads' | 'emailed-leads' | 'replied-leads'
 *   status    — comma-separated status filter (legacy, still supported)
 *   highValue — 'true' to filter high-value leads
 *   search    — search term for name, company, email, companyOwner, location
 *   page      — 1-based page number (default 1)
 *   pageSize  — items per page (default 50, max 200)
 *   limit     — legacy, if present overrides pageSize (no pagination)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const highValue = url.searchParams.get('highValue');
    const limit = url.searchParams.get('limit');
    const userId = url.searchParams.get('userId');
    const tab = url.searchParams.get('tab');
    const search = url.searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '50');
    const pageSize = Math.min(Math.max(1, pageSizeParam || 50), 200);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required to view leads' },
        { status: 401 }
      );
    }

    // Build Prisma where clause
    const where: any = {
      OR: [
        { assignedTo: userId },
        { leadsCreatedBy: userId }
      ]
    };

    // Tab-based server-side filtering (mirrors the old client-side logic)
    if (tab) {
      if (tab === 'replied-leads') {
        where.status = 'replied';
      } else if (tab === 'new-leads') {
        where.status = { not: 'replied' };
        where.emailSequenceActive = { not: true };
        where.OR = [
          { assignedTo: userId, emailHistory: { equals: [] as any } },
          { assignedTo: userId, emailHistory: { equals: null as any } },
          { leadsCreatedBy: userId, emailHistory: { equals: [] as any } },
          { leadsCreatedBy: userId, emailHistory: { equals: null as any } },
        ];
      } else if (tab === 'processing-leads') {
        where.status = { not: 'replied' };
        where.emailSequenceActive = true;
        where.emailSequenceStage = { not: 'called_seven_times' };
      } else if (tab === 'emailed-leads') {
        where.status = { not: 'replied' };
        where.OR = [
          {
            emailSequenceActive: { not: true },
            NOT: { emailHistory: { equals: [] as any } },
          },
          { emailSequenceStage: 'called_seven_times' },
        ];
      }
    }

    // Legacy status filter ( overrides tab-based status if both provided )
    if (status && !tab) {
      where.status = { in: status.split(',') };
    }

    if (highValue === 'true') {
      where.AND = [
        {
          OR: [
            { isHighValue: true },
            { 
              googleAds: true,
              OR: [
                { organicRanking: { gt: 10 } },
                { organicRanking: null }
              ]
            }
          ]
        }
      ];
    }

    // Server-side search
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyOwner: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Field selection — only fetch what the table needs
    const select = {
      id: true,
      name: true,
      company: true,
      companyOwner: true,
      location: true,
      email: true,
      website: true,
      linkedinProfile: true,
      status: true,
      stage: true,
      googleAds: true,
      googleAdsChecked: true,
      organicRanking: true,
      isHighValue: true,
      rating: true,
      reviews: true,
      source: true,
      industry: true,
      searchService: true,
      searchLocation: true,
      address: true,
      phone: true,
      notes: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      assignedTo: true,
      leadsCreatedBy: true,
      authInformation: true,
      emailValidationStatus: true,
      emailValidationCheckedAt: true,
      emailValidationDetails: true,
      emailSequenceActive: true,
      emailSequenceStage: true,
      emailSequenceStep: true,
      emailStatus: true,
      emailRetryCount: true,
      emailFailureCount: true,
      emailLastAttempt: true,
      emailErrors: true,
      emailHistory: true,
      nextScheduledEmail: true,
      emailSequenceStartDate: true,
      emailStoppedReason: true,
      emailAutomationEnabled: true,
      outreachRecipient: true,
      senderIdentity: true,
      lastContactedAt: true,
      lastEmailedAt: true,
      dealValue: true,
      probability: true,
      budget: true,
      closedDate: true,
      closedReason: true,
      lossReason: true,
      lossDescription: true,
      latitude: true,
      longitude: true,
    };

    // If legacy limit is provided, return all matching (no pagination)
    if (limit) {
      const leads = await prisma.lead.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit)
      });

      const leadIds = leads.map((l: any) => l.id).filter(Boolean);
      const openStats = await getBatchOpenStats(leadIds);

      const leadsWithOpenStats = leads.map((lead: any) => ({
        ...lead,
        emailOpenStats: openStats[lead.id] || { totalSent: 0, totalOpened: 0, openedStages: [], lastOpenedAt: null },
      }));

      return NextResponse.json({ 
        success: true,
        leads: leadsWithOpenStats,
        total: leadsWithOpenStats.length,
        hasMore: false
      });
    }

    // Paginated query — get total count and page data in parallel
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Batch fetch email open tracking stats for this page's leads only
    const leadIds = leads.map((l: any) => l.id).filter(Boolean);
    const openStats = await getBatchOpenStats(leadIds);

    // Attach open stats to each lead
    const leadsWithOpenStats = leads.map((lead: any) => ({
      ...lead,
      emailOpenStats: openStats[lead.id] || { totalSent: 0, totalOpened: 0, openedStages: [], lastOpenedAt: null },
    }));

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({ 
      success: true,
      leads: leadsWithOpenStats,
      total,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating new leads
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parseOptionalNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseOptionalInt = (value: unknown): number | null => {
      const parsed = parseOptionalNumber(value);
      return parsed === null ? null : Math.trunc(parsed);
    };

    const parseOptionalDate = (value: unknown): Date | null => {
      if (value === null || value === undefined || value === '') return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const parseTags = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      return [];
    };

    const parseOptionalJson = (value: unknown): any => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      if (typeof value === 'object') return value;
      return null;
    };

    const parseBoolean = (value: unknown, fallback = false): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }
      return fallback;
    };

    const {
      name,
      company,
      companyOwner,
      location,
      website,
      email,
      phone,
      linkedinProfile,
      status = 'active',
      notes,
      tags = [],
      source = 'manual',
      industry,
      googleAds = false,
      googleAdsChecked = false,
      organicRanking,
      isHighValue = false,
      dealValue,
      probability,
      budget,
      closedDate,
      closedReason,
      lossReason,
      lossDescription,
      stage,
      address,
      latitude,
      longitude,
      rating,
      reviews,
      authInformation,
      lastContactedAt,
      lastEmailedAt,
      emailAutomationEnabled,
      emailSequenceStage,
      emailSequenceStartDate,
      emailSequenceActive,
      nextScheduledEmail,
      emailSequenceStep,
      emailStoppedReason,
      emailRetryCount,
      emailFailureCount,
      emailLastAttempt,
      emailStatus,
      emailErrors,
      emailValidationStatus,
      emailValidationCheckedAt,
      emailValidationDetails,
      outreachRecipient,
      senderIdentity,
      emailHistory,
      nextFollowUpDate,
      followUpCount,
      createdAt,
    } = body;

    const normalizedName = String(name || '').trim();
    const normalizedCompany = String(company || '').trim();
    const normalizedEmail = String(email || '').trim();

    // Validate required fields
    if (!normalizedName || !normalizedCompany || !normalizedEmail) {
      return NextResponse.json(
        { success: false, error: 'Name, company, and email are required' },
        { status: 400 }
      );
    }

    // Merge interestKeywords & companyLinkedin into the authInformation JSON blob
    // (avoids needing a Prisma migration / db push for new columns)
    const interestKeywordsRaw = (body as any).interestKeywords;
    const companyLinkedinRaw = (body as any).companyLinkedin;
    const interestKeywordsStr = interestKeywordsRaw ? String(interestKeywordsRaw).trim() : '';
    const companyLinkedinStr = companyLinkedinRaw ? String(companyLinkedinRaw).trim() : '';

    const baseAuthInfo = parseOptionalJson(authInformation) || {};
    const authInformationWithExtras: any = {
      ...baseAuthInfo,
      ...(interestKeywordsStr ? { interest_keywords: interestKeywordsStr } : {}),
      ...(companyLinkedinStr ? { company_linkedin: companyLinkedinStr } : {}),
    };
    const finalAuthInformation =
      Object.keys(authInformationWithExtras).length > 0 ? authInformationWithExtras : null;

    // Get current user ID from request headers or session
    // (moved before duplicate check so we can scope the check to this user)
    const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Check if lead with same email already exists FOR THIS USER
    // (different users can have the same lead — duplicate check is per-user)
    const existingLead = await prisma.lead.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        OR: [
          { assignedTo: userId },
          { leadsCreatedBy: userId }
        ]
      }
    });
    if (existingLead) {
      return NextResponse.json(
        { success: false, error: 'A lead with this email already exists in your account' },
        { status: 400 }
      );
    }

    // Create new lead
    const savedLead = await prisma.lead.create({
      data: {
        name: normalizedName,
        company: normalizedCompany,
        companyOwner: String(companyOwner || '').trim() || null,
        location: String(location || '').trim(),
        website: String(website || '').trim() || null,
        email: normalizedEmail,
        phone: String(phone || '').trim() || null,
        linkedinProfile: String(linkedinProfile || '').trim() || null,
        status: String(status || 'active').trim() || 'active',
        stage: String(stage || 'new_leads').trim() || 'new_leads',
        notes: String(notes || '').trim() || null,
        tags: parseTags(tags),
        source: String(source || 'manual').trim() || 'manual',
        industry: String(industry || '').trim() || null,
        googleAds: parseBoolean(googleAds, false),
        googleAdsChecked: parseBoolean(googleAdsChecked, false),
        organicRanking: parseOptionalInt(organicRanking),
        isHighValue: parseBoolean(isHighValue, false),
        dealValue: parseOptionalNumber(dealValue),
        probability: parseOptionalInt(probability),
        budget: parseOptionalNumber(budget),
        closedDate: parseOptionalDate(closedDate),
        closedReason: String(closedReason || '').trim() || null,
        lossReason: String(lossReason || '').trim() || null,
        lossDescription: String(lossDescription || '').trim() || null,
        address: String(address || '').trim() || null,
        latitude: parseOptionalNumber(latitude),
        longitude: parseOptionalNumber(longitude),
        rating: parseOptionalNumber(rating),
        reviews: parseOptionalInt(reviews),
        authInformation: finalAuthInformation,
        lastContactedAt: parseOptionalDate(lastContactedAt),
        lastEmailedAt: parseOptionalDate(lastEmailedAt),
        emailAutomationEnabled: parseBoolean(emailAutomationEnabled, true),
        emailSequenceStage: String(emailSequenceStage || '').trim() || null,
        emailSequenceStartDate: parseOptionalDate(emailSequenceStartDate),
        emailSequenceActive: parseBoolean(emailSequenceActive, false),
        nextScheduledEmail: parseOptionalDate(nextScheduledEmail),
        emailSequenceStep: parseOptionalInt(emailSequenceStep),
        emailStoppedReason: String(emailStoppedReason || '').trim() || null,
        emailRetryCount: parseOptionalInt(emailRetryCount) ?? 0,
        emailFailureCount: parseOptionalInt(emailFailureCount) ?? 0,
        emailLastAttempt: parseOptionalDate(emailLastAttempt),
        emailStatus: String(emailStatus || '').trim() || 'ready',
        emailErrors: parseOptionalJson(emailErrors),
        emailValidationStatus: String(emailValidationStatus || '').trim() || 'valid',
        emailValidationCheckedAt: parseOptionalDate(emailValidationCheckedAt) || new Date(),
        emailValidationDetails: parseOptionalJson(emailValidationDetails) || { isValid: true, reason: 'marked_valid_no_scan', source: 'manual' },
        outreachRecipient: String(outreachRecipient || '').trim() || 'lead',
        senderIdentity: String(senderIdentity || '').trim() || 'company',
        emailHistory: parseOptionalJson(emailHistory),
        nextFollowUpDate: parseOptionalDate(nextFollowUpDate),
        followUpCount: parseOptionalInt(followUpCount) ?? 0,
        createdAt: parseOptionalDate(createdAt) || undefined,
        assignedTo: userId,
        leadsCreatedBy: userId
      }
    });

    return NextResponse.json({
      success: true,
      lead: savedLead,
      message: 'Lead created successfully and assigned to current user'
    });

  } catch (error: any) {
    console.error('Error creating lead:', error);

    // Handle duplicate email error
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A lead with this email already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create lead'
      },
      { status: 500 }
    );
  }
}