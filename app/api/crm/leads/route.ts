import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET handler for retrieving leads for CRM system
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    // Get user ID from query params
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }
    
    // Check if this is a request for a specific lead
    const leadId = searchParams.get('leadId');
    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId }
      });
      
      if (!lead) {
        return NextResponse.json(
          { success: false, error: 'Lead not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        lead
      });
    }
    
    // Get pagination params
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');
    
    // Build where clause for user-scoped leads
    const where: any = {
      OR: [
        { assignedTo: userId },
        { leadsCreatedBy: userId }
      ]
    };
    
    // Get leads
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip
    });
    
    const total = await prisma.lead.count({ where });
    
    // Calculate stage counts for pipeline display
    const stageCounts: Record<string, number> = {};
    const stages = [
      'new_leads', 'called_once', 'called_twice', 'called_three_times',
      'called_four_times', 'called_five_times', 'called_six_times',
      'called_seven_times', 'meeting', 'deal'
    ];
    
    for (const stage of stages) {
      stageCounts[stage] = await prisma.lead.count({
        where: {
          ...where,
          stage
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      leads,
      total,
      totalCount: total,
      stageCounts,
      hasMore: total > skip + limit
    });
    
  } catch (error: any) {
    console.error('Error loading CRM leads:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return NextResponse.json(
      { success: false, error: 'Failed to load leads', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating a lead from CRM modal
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const name = String(body?.name || '').trim();
    const company = String(body?.company || '').trim();
    const email = String(body?.email || '').trim();

    if (!name || !company || !email) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: Name, Company, Email' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    const existingLead = await prisma.lead.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
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

    const parseOptionalNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag: string) => tag.trim())
      : [];

    const authInformation = body?.authInformation && typeof body.authInformation === 'object'
      ? body.authInformation
      : undefined;

    const savedLead = await prisma.lead.create({
      data: {
        name,
        company,
        email,
        companyOwner: String(body?.companyOwner || '').trim() || null,
        location: String(body?.location || '').trim(),
        website: String(body?.website || '').trim() || null,
        phone: String(body?.phone || '').trim() || null,
        linkedinProfile: String(body?.linkedinProfile || '').trim() || null,
        status: String(body?.status || 'active').trim() || 'active',
        stage: String(body?.stage || 'new_leads').trim() || 'new_leads',
        notes: String(body?.notes || '').trim() || null,
        tags,
        source: String(body?.source || 'manual').trim() || 'manual',
        industry: String(body?.industry || '').trim() || null,
        googleAds: !!body?.googleAds,
        organicRanking: parseOptionalNumber(body?.organicRanking),
        isHighValue: !!body?.isHighValue,
        dealValue: parseOptionalNumber(body?.dealValue),
        probability: parseOptionalNumber(body?.probability),
        rating: parseOptionalNumber(body?.rating),
        reviews: parseOptionalNumber(body?.reviews),
        authInformation,
        assignedTo: userId,
        leadsCreatedBy: userId,
      }
    });

    return NextResponse.json({
      success: true,
      lead: savedLead,
      message: 'Lead created successfully'
    });
  } catch (error: any) {
    console.error('Error creating CRM lead:', error);

    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A lead with this email already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create lead', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating a lead
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, ...updateData } = body;
    
    if (!leadId) {
      return NextResponse.json(
        { success: false, error: 'Lead ID is required' },
        { status: 400 }
      );
    }
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData
    });
    
    return NextResponse.json({
      success: true,
      lead: updatedLead
    });
    
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update lead' },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for deleting a lead
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const leadId = url.searchParams.get('leadId');
    
    if (!leadId) {
      return NextResponse.json(
        { success: false, error: 'Lead ID is required' },
        { status: 400 }
      );
    }
    
    await prisma.lead.delete({
      where: { id: leadId }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Lead deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete lead' },
      { status: 500 }
    );
  }
}
