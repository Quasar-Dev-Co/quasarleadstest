import { createOpenAIServiceForUser } from './openaiService';
import { prisma } from './prisma';

export interface LeadWithOwner {
  name: string;
  company: string;
  location: string;
  email: string;
  companyOwner?: string;
  [key: string]: any;
}

export async function enrichLeadWithOwner(lead: any, userId: string): Promise<LeadWithOwner> {
  try {
    const openaiService = await createOpenAIServiceForUser(userId);
    if (!openaiService) return { ...lead };

    const ownerResult = await openaiService.lookupCompanyOwner(lead.company);
    if (ownerResult.success && ownerResult.ownerName) {
      return { ...lead, companyOwner: ownerResult.ownerName };
    }
    return { ...lead };
  } catch (error) {
    console.error(`Error enriching lead \${lead.company} with owner:`, error);
    return { ...lead };
  }
}

export async function enrichLeadsWithOwners(leads: any[], userId: string): Promise<LeadWithOwner[]> {
  try {
    const openaiService = await createOpenAIServiceForUser(userId);
    if (!openaiService) return leads;

    const companyNames = [...new Set(leads.map(lead => lead.company))];
    const ownerResults = await openaiService.batchLookupCompanyOwners(companyNames);

    const companyToOwner: Record<string, string> = {};
    ownerResults.forEach(result => {
      if (result.result.success && result.result.ownerName) {
        companyToOwner[result.company] = result.result.ownerName;
      }
    });

    return leads.map(lead => ({
      ...lead,
      companyOwner: companyToOwner[lead.company] || undefined
    }));
  } catch (error) {
    console.error('Error enriching leads with owners:', error);
    return leads;
  }
}

export async function updateExistingLeadsWithOwners(userId: string, companyNames?: string[]): Promise<{
  total: number;
  updated: number;
  errors: number;
}> {
  try {
    const openaiService = await createOpenAIServiceForUser(userId);
    if (!openaiService) throw new Error(`OpenAI service not available for user \${userId}`);

    const leadsToUpdate = await prisma.lead.findMany({
      where: {
        assignedTo: userId,
        companyOwner: { equals: null as any },
        ...(companyNames && companyNames.length > 0 ? { company: { in: companyNames } } : {})
      },
      select: { id: true, company: true }
    });

    if (leadsToUpdate.length === 0) return { total: 0, updated: 0, errors: 0 };

    const uniqueCompanies = [...new Set(leadsToUpdate.map(lead => lead.company))];
    const ownerResults = await openaiService.batchLookupCompanyOwners(uniqueCompanies);

    let updated = 0;
    let errors = 0;

    for (const result of ownerResults) {
      if (result.result.success && result.result.ownerName) {
        try {
          const updateResult = await prisma.lead.updateMany({
            where: {
              company: result.company,
              assignedTo: userId,
              companyOwner: { equals: null as any }
            },
            data: {
              companyOwner: result.result.ownerName,
              updatedAt: new Date()
            }
          });
          updated += updateResult.count;
        } catch (error) {
          errors++;
        }
      }
    }

    return { total: leadsToUpdate.length, updated, errors };
  } catch (error) {
    console.error('Error updating existing leads with owners:', error);
    throw error;
  }
}

export default {
  enrichLeadWithOwner,
  enrichLeadsWithOwners,
  updateExistingLeadsWithOwners
};
