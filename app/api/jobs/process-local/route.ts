import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { enrichLeadsWithOwners } from '@/lib/leadEnrichment';

// Environment variables (will be overridden by user-specific creds when available)
let SERPAPI_KEY = process.env.SERPAPI_KEY || '';
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Initialize OpenAI only if API key is available
let openai: OpenAI | null = null;
if (OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  } catch (error) {
    openai = null;
  }
}

interface ProcessedLead {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  linkedinProfile: string;
  notes: string;
  location: string;
  status: string;
  source: string;
  tags: string[];
  isHighValue?: boolean;
  organicRanking?: number | null;
  isRunningAds?: boolean;
}

async function cleanLeadsWithAI(leads: any[], service: string, location: string): Promise<ProcessedLead[]> {
  if (!openai) return leads;
  const cleanedLeads: ProcessedLead[] = [];
  try {
    for (let i = 0; i < leads.length; i += 10) {
      const batch = leads.slice(i, i + 10);
      const prompt = `Clean and validate these leads: \${JSON.stringify(batch)} for \${service} in \${location}. Return JSON array.`;
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });
      const content = response.choices[0]?.message?.content;
      if (content) cleanedLeads.push(...JSON.parse(content));
      else cleanedLeads.push(...batch);
    }
  } catch (error) {
    return leads;
  }
  return cleanedLeads;
}

async function generateHighValueLeads(service: string, location: string, existingLeads: ProcessedLead[], targetCount: number = 20): Promise<ProcessedLead[]> {
  if (!openai) return [];
  const highValueLeads: ProcessedLead[] = [];
  try {
    const prompt = `Generate \${targetCount} high-value leads for \${service} in \${location}. Return JSON: {"high_value_leads": [...]}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });
    const content = response.choices[0]?.message?.content;
    if (content) {
      const aiData = JSON.parse(content);
      aiData.high_value_leads?.forEach((aiLead: any) => {
        highValueLeads.push({
          name: aiLead.name || 'Decision Maker',
          company: aiLead.company,
          email: aiLead.email,
          phone: aiLead.phone || '',
          website: aiLead.website,
          linkedinProfile: aiLead.linkedinProfile || '',
          notes: aiLead.reasoning || 'High-value',
          location,
          status: 'active',
          source: 'ai-high-value',
          tags: [service.toLowerCase(), location.toLowerCase(), 'ai-generated', 'high-value'],
          isHighValue: true,
          isRunningAds: true,
          organicRanking: aiLead.organicRanking || 20
        });
      });
    }
  } catch (error) { }
  return highValueLeads;
}

async function processServiceLocation(service: string, location: string, leadQuantity: number, includeGoogleAdsAnalysis = false, analyzeLeads = false, userId?: string): Promise<ProcessedLead[]> {
  const processedLeads: ProcessedLead[] = [];
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://testqlagain.vercel.app';
    const apiEndpoint = includeGoogleAdsAnalysis && analyzeLeads ? `\${baseUrl}/api/findleads` : `\${baseUrl}/api/findleads-normal`;
    const findLeadsResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: [service], locations: [location], leadQuantity, userId }),
    });
    if (!findLeadsResponse.ok) throw new Error('API failed');
    const findLeadsData = await findLeadsResponse.json();
    const initialLeads = findLeadsData.leads || [];
    for (const lead of initialLeads) {
      processedLeads.push({
        name: lead.name || 'Contact',
        company: lead.company || 'Unknown',
        email: lead.email || '',
        phone: lead.phone || '',
        website: lead.website || '',
        linkedinProfile: lead.linkedinProfile || '',
        notes: lead.description || '',
        location,
        status: 'active',
        source: lead.source || 'findleads-api',
        tags: [service.toLowerCase(), location.toLowerCase()],
        isHighValue: false,
        isRunningAds: false
      });
    }
    if (analyzeLeads && openai) {
      const leadsNeedingEnhancement = processedLeads.filter(l => !l.email || !l.linkedinProfile);
      if (leadsNeedingEnhancement.length > 0) {
        const cleaned = await cleanLeadsWithAI(leadsNeedingEnhancement, service, location);
        cleaned.forEach((c, i) => Object.assign(leadsNeedingEnhancement[i], c));
      }
    }
    if (includeGoogleAdsAnalysis) {
      const { GoogleAdsDetector } = await import('@/lib/googleAdsDetector');
      const adsDetector = new GoogleAdsDetector(SERPAPI_KEY);
      for (const lead of processedLeads) {
        if (!lead.website) continue;
        const adsResult = await adsDetector.checkGoogleAds(lead.website, service, location);
        lead.isRunningAds = adsResult.hasGoogleAds;
        if (adsResult.organicRanking) lead.organicRanking = adsResult.organicRanking;
        if (adsResult.hasGoogleAds && (!adsResult.organicRanking || adsResult.organicRanking > 10)) {
          lead.isHighValue = true;
        }
      }
    }
  } catch (error) { }
  return processedLeads.filter(l => l.email && l.email.includes('@'));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { jobId } = body;
    if (!jobId) return NextResponse.json({ success: false, error: 'Job ID required' }, { status: 400 });

    const job = await prisma.jobQueue.findUnique({ where: { jobId } });
    if (!job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    if (job.status !== 'pending') return NextResponse.json({ success: false, error: 'Not pending' }, { status: 400 });

    if (job.userId) {
      const user = await prisma.user.findUnique({ where: { id: job.userId } });
      const creds = (user?.credentials as any) || {};
      if (creds.SERPAPI_KEY) SERPAPI_KEY = creds.SERPAPI_KEY;
      if (creds.OPENAI_API_KEY) {
        OPENAI_API_KEY = creds.OPENAI_API_KEY;
        openai = new OpenAI({ apiKey: creds.OPENAI_API_KEY });
      }
    }

    await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'running', startedAt: new Date() } });

    const { services, locations, leadQuantity, includeGoogleAdsAnalysis = false, analyzeLeads = false } = job as any;
    const totalSteps = services.length * locations.length;
    let totalLeadsCollected = 0;

    for (let sIdx = 0; sIdx < services.length; sIdx++) {
      for (let lIdx = 0; lIdx < locations.length; lIdx++) {
        const service = services[sIdx];
        const location = locations[lIdx];
        const currentStep = sIdx * locations.length + lIdx + 1;

        try {
          await prisma.jobQueue.update({
            where: { id: job.id },
            data: {
              progress: Math.round((currentStep / totalSteps) * 100),
              progressMessage: `Processing: \${service} in \${location}`,
              currentStep
            }
          });

          const leads = await processServiceLocation(service, location, leadQuantity, includeGoogleAdsAnalysis, analyzeLeads, job.userId || undefined);
          const enrichedLeads = await enrichLeadsWithOwners(leads, job.userId || 'quasar-admin');

          for (const lead of enrichedLeads) {
            const existing = await prisma.lead.findFirst({
              where: {
                OR: [
                  { email: lead.email },
                  { AND: [{ name: lead.name }, { company: lead.company }] },
                  ...(lead.website ? [{ website: lead.website }] : [])
                ]
              }
            });

            if (!existing) {
              await prisma.lead.create({
                data: {
                  ...lead,
                  googleAds: (lead as any).isRunningAds || false,
                  googleAdsChecked: (lead as any).isRunningAds !== undefined,
                  assignedTo: job.userId || 'quasar-admin',
                  leadsCreatedBy: job.userId || 'quasar-admin'
                }
              });
              totalLeadsCollected++;
            }
          }
          await prisma.jobQueue.update({ where: { id: job.id }, data: { collectedLeads: totalLeadsCollected } });
        } catch (err) { }
      }
    }

    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: 'completed', progress: 100, progressMessage: 'Done', completedAt: new Date(), totalLeadsCollected }
    });

    return NextResponse.json({ success: true, jobId: job.jobId, totalLeadsCollected });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}