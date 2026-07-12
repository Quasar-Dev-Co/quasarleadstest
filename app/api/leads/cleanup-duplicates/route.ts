import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST endpoint to clean up duplicate leads
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('Starting duplicate cleanup process...');

    const by = request.nextUrl?.searchParams?.get('by') || 'email_company';
    const scope = request.nextUrl?.searchParams?.get('scope') || 'all';

    const authHeader = request.headers.get('authorization') || '';
    const bearerUserId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    // Fetch leads based on scope
    const where: any = {};
    if (scope === 'user' && bearerUserId) {
      where.OR = [
        { assignedTo: bearerUserId },
        { leadsCreatedBy: bearerUserId }
      ];
    }

    const allLeads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        email: true,
        company: true,
        createdAt: true,
        linkedinProfile: true,
        website: true,
        phone: true,
        isHighValue: true,
        googleAds: true,
        googleAdsChecked: true,
        organicRanking: true,
        tags: true
      }
    });

    // Group leads in memory for better control over case-insensitivity and merging
    const groups = new Map<string, any[]>();
    for (const lead of allLeads) {
      const emailKey = (lead.email || '').toLowerCase().trim();
      const companyKey = (lead.company || '').toLowerCase().trim();
      const groupKey = by === 'email' ? emailKey : `\${emailKey}|\${companyKey}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(lead);
    }

    const duplicatesToRemove: string[] = [];
    const updatesQueue: Array<{ id: string; updates: any; company: string }> = [];

    for (const [key, leads] of groups.entries()) {
      if (leads.length <= 1) continue;

      // Sort by creation date to keep the oldest
      const sortedLeads = leads.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const original = sortedLeads[0];
      const duplicates = sortedLeads.slice(1);

      const mergedData: any = {};
      let hasUpdates = false;

      for (const duplicate of duplicates) {
        if (!original.linkedinProfile && duplicate.linkedinProfile) {
          mergedData.linkedinProfile = duplicate.linkedinProfile;
          hasUpdates = true;
        }
        if (!original.website && duplicate.website) {
          mergedData.website = duplicate.website;
          hasUpdates = true;
        }
        if (!original.phone && duplicate.phone) {
          mergedData.phone = duplicate.phone;
          hasUpdates = true;
        }
        if (!original.isHighValue && duplicate.isHighValue) {
          mergedData.isHighValue = true;
          hasUpdates = true;
        }
        if (!original.googleAds && duplicate.googleAds) {
          mergedData.googleAds = true;
          mergedData.googleAdsChecked = true;
          hasUpdates = true;
        }
        if (!original.organicRanking && duplicate.organicRanking) {
          mergedData.organicRanking = duplicate.organicRanking;
          hasUpdates = true;
        }

        // Merge tags
        if (duplicate.tags && Array.isArray(duplicate.tags)) {
          const existingTags = (original.tags as string[]) || [];
          const newTags = duplicate.tags.filter((tag: string) => !existingTags.includes(tag));
          if (newTags.length > 0) {
            mergedData.tags = [...existingTags, ...newTags];
            hasUpdates = true;
          }
        }

        duplicatesToRemove.push(duplicate.id);
      }

      if (hasUpdates) {
        updatesQueue.push({
          id: original.id,
          updates: mergedData,
          company: original.company
        });
      }
    }

    // Execute updates
    for (const item of updatesQueue) {
      await prisma.lead.update({
        where: { id: item.id },
        data: item.updates
      });
    }

    // Execute deletions
    if (duplicatesToRemove.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: duplicatesToRemove } }
      });
    }

    const finalCount = await prisma.lead.count();

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      stats: {
        duplicatesRemoved: duplicatesToRemove.length,
        leadsUpdated: updatesQueue.length,
        finalLeadCount: finalCount
      }
    });

  } catch (error: any) {
    console.error('Error cleaning up duplicates:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to clean up duplicates' }, { status: 500 });
  }
}

/**
 * GET endpoint to analyze duplicates
 */
export async function GET(): Promise<NextResponse> {
  try {
    const allLeads = await prisma.lead.findMany({
      select: { id: true, email: true, company: true }
    });

    const emailGroups = new Map<string, number>();
    const companyGroups = new Map<string, number>();

    for (const lead of allLeads) {
      const email = (lead.email || '').toLowerCase().trim();
      const company = (lead.company || '').toLowerCase().trim();

      if (email) emailGroups.set(email, (emailGroups.get(email) || 0) + 1);
      if (company) companyGroups.set(company, (companyGroups.get(company) || 0) + 1);
    }

    const emailDuplicates = Array.from(emailGroups.entries()).filter(([_, count]) => count > 1);
    const companyDuplicates = Array.from(companyGroups.entries()).filter(([_, count]) => count > 1);

    return NextResponse.json({
      success: true,
      analysis: {
        totalLeads: allLeads.length,
        emailDuplicateGroups: emailDuplicates.length,
        companyDuplicateGroups: companyDuplicates.length
      }
    });

  } catch (error: any) {
    console.error('Error analyzing duplicates:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to analyze duplicates' }, { status: 500 });
  }
}