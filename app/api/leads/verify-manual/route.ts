import { NextRequest, NextResponse } from 'next/server';
import { getJson } from 'serpapi';
import { prisma } from '@/lib/prisma';

const SERPAPI_KEY = process.env.SERPAPI_KEY;

interface VerificationResult {
  leadId: string;
  company: string;
  website: string;
  foundInAds: boolean;
  foundInOrganic: boolean;
  adPosition?: number;
  organicPosition?: number;
  searchQuery: string;
  location: string;
  timestamp: string;
  verificationStatus: 'verified' | 'partially_verified' | 'not_found';
  notes: string[];
}

function cleanDomain(url: string): string {
  if (!url) return '';
  try {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!SERPAPI_KEY) {
      return NextResponse.json({ success: false, error: 'SERP API key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { leadIds, service, location } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Please provide leadIds array' }, { status: 400 });
    }

    if (!service || !location) {
      return NextResponse.json({ success: false, error: 'Please provide service and location' }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        isHighValue: true
      }
    });

    if (leads.length === 0) {
      return NextResponse.json({ success: false, error: 'No high-value leads found' });
    }

    const verificationResults: VerificationResult[] = [];
    const searchQueries = [
      `\${service} "\${location}"`,
      `best \${service} "\${location}"`,
      `\${service} company "\${location}"`
    ];

    for (const lead of leads) {
      let bestResult: VerificationResult = {
        leadId: lead.id,
        company: lead.company || '',
        website: lead.website || '',
        foundInAds: false,
        foundInOrganic: false,
        searchQuery: '',
        location,
        timestamp: new Date().toISOString(),
        verificationStatus: 'not_found',
        notes: []
      };

      for (const query of searchQueries) {
        try {
          const searchResults = await getJson({
            engine: "google",
            api_key: SERPAPI_KEY,
            q: query,
            location,
            num: 20,
            hl: "en"
          });

          const domain = lead.website ? cleanDomain(lead.website) : '';
          let foundInAds = false;
          let foundInOrganic = false;
          let adPosition: number | undefined;
          let organicPosition: number | undefined;

          const allAds = [...(searchResults.ads || []), ...(searchResults.bottom_ads || [])];
          allAds.forEach((ad: any, index: number) => {
            const adDomain = cleanDomain(ad.link || ad.displayed_link);
            if (domain && adDomain === domain) {
              foundInAds = true;
              adPosition = index + 1;
            }
          });

          const organicResults = searchResults.organic_results || [];
          organicResults.forEach((result: any, index: number) => {
            const organicDomain = cleanDomain(result.link);
            if (domain && organicDomain === domain) {
              foundInOrganic = true;
              organicPosition = index + 1;
            }
          });

          if (foundInAds || foundInOrganic) {
            bestResult = {
              ...bestResult,
              foundInAds,
              foundInOrganic,
              adPosition,
              organicPosition,
              searchQuery: query,
              verificationStatus: foundInAds && foundInOrganic ? 'verified' : 'partially_verified',
              notes: [`Found in query: \${query}`]
            };
            if (foundInAds) break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error(`Error searching query \${query}:`, err);
        }
      }
      verificationResults.push(bestResult);
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: leads.length,
        verified: verificationResults.filter(r => r.verificationStatus === 'verified').length,
        partiallyVerified: verificationResults.filter(r => r.verificationStatus === 'partially_verified').length,
        notFound: verificationResults.filter(r => r.verificationStatus === 'not_found').length,
      },
      results: verificationResults
    });

  } catch (error: any) {
    console.error('Error in manual verification:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const highValueLeads = await prisma.lead.findMany({
      where: { isHighValue: true },
      take: 5
    });

    return NextResponse.json({
      message: 'Manual High-Value Lead Verification API',
      availableLeads: highValueLeads.length,
      sampleLeads: highValueLeads.map(l => ({ id: l.id, company: l.company }))
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}