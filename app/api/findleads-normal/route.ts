import { NextRequest, NextResponse } from 'next/server';
import { getJson } from 'serpapi';
import { prisma } from '@/lib/prisma';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import {
  getApiKeysFromCredentials,
  isSerpApiRotationError,
  withApiKeyRotation,
} from '@/lib/api-key-rotation';

// Basic type definitions for normal leads
interface ScrapedData {
  url: string;
  title: string;
  emails: string[];
  phones: string[];
  extractionSuccess: boolean;
}

interface BasicLead {
  url: string;
  title: string;
  snippet: string;
  ranking: number;
  domain: string;
  scrapedData: ScrapedData;
  emailFound: boolean;
  emails: string[];
  // NEW: Google Maps business data
  businessName: string;
  phone: string;
  address: string;
  rating: number;
  reviews: number;
  businessType: string;
  placeId: string;
}

interface ProcessedLead {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  linkedinProfile: string;
  description: string;
  location: string;
  status: string;
  source: string;
  searchService: string;
  searchLocation: string;
  tags: string[];
  leadSource: 'organic' | 'local';
}

// Helper to validate required credential keys
function requireCredentials(creds: Record<string, string | undefined>, keys: string[]): { ok: boolean; missing: string[] } {
  const missing = keys.filter((k) => !creds[k]);
  return { ok: missing.length === 0, missing };
}
const SCRAPE_TIMEOUT: number = 8000; // Shorter timeout for faster processing
const RATE_LIMIT_DELAY: number = 1000; // Standard delay

// Basic rate limiter
const rateLimit = (): Promise<void> => new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

// Simple email extraction for normal leads
function extractBasicEmails(html: string, text: string): string[] {
  const emails = new Set<string>();

  const emailPattern = /\b[a-zA-Z0-9]([a-zA-Z0-9._+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}\b/g;

  const sources = [html, text];

  sources.forEach((source: string) => {
    if (!source) return;

    const matches = source.match(emailPattern);
    if (matches) {
      matches.forEach((email: string) => {
        const cleanEmail = email.replace(/\s+/g, '').toLowerCase().trim();

        if (cleanEmail.includes('@') && cleanEmail.includes('.')) {
          // Basic validation - avoid obvious spam emails
          if (!cleanEmail.includes('example') &&
            !cleanEmail.includes('yoursite') &&
            !cleanEmail.includes('placeholder') &&
            !cleanEmail.includes('test@')) {
            emails.add(cleanEmail);
          }
        }
      });
    }
  });

  return Array.from(emails);
}

// Simple phone extraction
function extractBasicPhones(text: string): string[] {
  const phones = new Set<string>();
  const phoneRegex = /(?:\+\d{1,4}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?(?:\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{0,4})/g;
  const phoneMatches = text.match(phoneRegex);

  if (phoneMatches) {
    phoneMatches.forEach((phone: string) => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) {
        phones.add(phone);
      }
    });
  }

  return Array.from(phones);
}

function cleanDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

// Deduplicate leads by domain to avoid collecting the same business multiple times
function deduplicateLeads(leads: BasicLead[]): BasicLead[] {
  const seenDomains = new Set<string>();
  const uniqueLeads: BasicLead[] = [];

  for (const lead of leads) {
    if (!seenDomains.has(lead.domain)) {
      seenDomains.add(lead.domain);
      uniqueLeads.push(lead);
    }
  }

  console.log(`🔧 Deduplication: \${leads.length} → \${uniqueLeads.length} unique leads (removed \${leads.length - uniqueLeads.length} duplicates)`);
  return uniqueLeads;
}

// Basic website scraping for normal leads
async function scrapeWebsiteBasic(url: string): Promise<ScrapedData> {
  const defaultData: ScrapedData = {
    url,
    title: '',
    emails: [],
    phones: [],
    extractionSuccess: false
  };

  try {
    console.log(`📄 Basic scraping: \${url}`);

    const response = await axios.get(url, {
      timeout: SCRAPE_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    });

    const $ = cheerio.load(response.data);

    // Extract basic information
    const title = $('title').text().trim() || $('h1').first().text().trim();
    const bodyText = $('body').text();
    const html = response.data;

    // Extract emails and phones
    const emails = extractBasicEmails(html, bodyText);
    const phones = extractBasicPhones(bodyText);

    return {
      url,
      title,
      emails,
      phones,
      extractionSuccess: true
    };

  } catch (error) {
    console.log(`❌ Basic scraping failed for \${url}: \${error}`);
    return defaultData;
  }
}

// 🗺️ GOOGLE MAPS SEARCH - Real business leads with names, phones, addresses!
async function searchGoogleMapsBusiness(service: string, location: string, serpApiKeys: string[], searchType: string = 'basic'): Promise<BasicLead[]> {
  const leads: BasicLead[] = [];

  if (serpApiKeys.length === 0) {
    throw new Error('SERPAPI_KEY is not configured');
  }

  try {
    console.log(`🗺️ Google Maps Business Search [\${searchType}]: \${service} in \${location}`);

    const searchParams = {
      engine: "google_maps",
      q: `\${service} \${location}`,
      type: "search",
      location: location,
      hl: "en"
    };

    const rotated = await withApiKeyRotation(
      serpApiKeys,
      async (apiKey) => {
        const response = await getJson({ ...searchParams, api_key: apiKey });
        if ((response as any)?.error) {
          throw { status: 400, data: response, message: String((response as any).error) };
        }
        return response;
      },
      isSerpApiRotationError,
      'SERPAPI'
    );

    if (rotated.usedIndex > 0) {
      console.warn(`⚠️ SERPAPI rotated to key #${rotated.usedIndex + 1} for ${searchType} search (${service} in ${location})`);
    }

    const response = rotated.value as any;

    const localResults = response.local_results || [];
    console.log(`📊 Found \${localResults.length} Google Maps business results`);

    for (let i = 0; i < localResults.length; i++) {
      const business = localResults[i];

      try {
        const businessName = business.title || '';
        const phone = business.phone || '';
        const address = business.address || '';
        const website = business.website || business.link || '';
        const rating = business.rating || 0;
        const reviews = business.reviews || 0;
        const businessType = business.type || service;
        const placeId = business.place_id || '';
        const snippet = business.snippet || business.description || '';

        let scrapedData: ScrapedData = {
          url: website,
          title: businessName,
          emails: [],
          phones: [phone].filter(p => p),
          extractionSuccess: !!businessName
        };

        if (website && website.startsWith('http')) {
          try {
            await new Promise(resolve => setTimeout(resolve, 300));
            scrapedData = await scrapeWebsiteBasic(website);
            if (scrapedData.phones.length === 0 && phone) {
              scrapedData.phones = [phone];
            }
          } catch (error) {
            console.log(`⚠️ Website scraping failed for \${businessName}, using Maps data only`);
          }
        }

        leads.push({
          url: website,
          title: businessName,
          snippet: snippet,
          ranking: i + 1,
          domain: website ? cleanDomain(website) : businessName.toLowerCase().replace(/[^a-z0-9]/g, ''),
          scrapedData,
          emailFound: scrapedData.emails.length > 0,
          emails: scrapedData.emails,
          businessName,
          phone,
          address,
          rating,
          reviews,
          businessType,
          placeId
        });

      } catch (error) {
        console.log(`❌ Error processing Google Maps business \${i + 1}: \${error}`);
      }
    }
  } catch (error) {
    console.error(`Error in Google Maps \${searchType} search:`, error);
  }
  return leads;
}

async function searchGoogleMapsBest(service: string, location: string, serpApiKeys: string[]): Promise<BasicLead[]> {
  return await searchGoogleMapsBusiness(`best \${service}`, location, serpApiKeys, 'best');
}

async function searchGoogleMapsTop(service: string, location: string, serpApiKeys: string[]): Promise<BasicLead[]> {
  return await searchGoogleMapsBusiness(`top \${service}`, location, serpApiKeys, 'top');
}

async function searchGoogleMapsCompanies(service: string, location: string, serpApiKeys: string[]): Promise<BasicLead[]> {
  return await searchGoogleMapsBusiness(`\${service} companies`, location, serpApiKeys, 'companies');
}

async function searchGoogleMapsServices(service: string, location: string, serpApiKeys: string[]): Promise<BasicLead[]> {
  return await searchGoogleMapsBusiness(`\${service} services`, location, serpApiKeys, 'services');
}

function formatGoogleMapsLeads(mapLeads: BasicLead[], service: string, location: string): ProcessedLead[] {
  const processedLeads: ProcessedLead[] = [];

  mapLeads.forEach((lead) => {
    const email = lead.emails[0] || '';
    const phone = lead.phone || lead.scrapedData.phones[0] || '';
    const businessName = lead.businessName || lead.title.split(' - ')[0].split(' | ')[0].trim();
    const website = lead.url || '';
    const address = lead.address || '';
    const rating = lead.rating || 0;
    const reviews = lead.reviews || 0;

    const description = [
      lead.snippet,
      address ? `Address: \${address}` : '',
      rating > 0 ? `Rating: \${rating}⭐ (\${reviews} reviews)` : '',
      lead.businessType ? `Type: \${lead.businessType}` : ''
    ].filter(Boolean).join(' | ');

    processedLeads.push({
      name: businessName,
      company: businessName,
      email: email,
      phone: phone,
      website: website,
      linkedinProfile: '',
      description: description,
      location: address || location,
      status: 'active',
      source: 'google-maps-leads',
      searchService: service,
      searchLocation: location,
      tags: [
        service,
        location,
        'google-maps',
        'real-business-data',
        email ? 'has-email' : 'needs-email',
        phone ? 'has-phone' : 'needs-phone',
        rating > 4 ? 'high-rated' : rating > 0 ? 'rated' : 'unrated',
        reviews > 50 ? 'popular' : reviews > 10 ? 'established' : 'new'
      ],
      leadSource: 'local'
    });
  });

  return processedLeads;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { services, locations, leadQuantity = 20, userId } = body;

    const finalUserId = userId || request.nextUrl.searchParams.get('userId');
    if (!finalUserId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 401 });
    }

    // Load credentials from the user's profile using Prisma
    let serpApiKeys: string[] = [];
    const user = await prisma.user.findUnique({
      where: { id: finalUserId },
      select: { credentials: true }
    });

    const credentials = (user?.credentials as any) || {};
    serpApiKeys = getApiKeysFromCredentials(credentials as Record<string, any>, 'SERPAPI_KEY', 'SERPAPI_ACCOUNTS');

    const credsCheck = requireCredentials({ SERPAPI_KEY: serpApiKeys[0] }, ['SERPAPI_KEY']);
    if (!credsCheck.ok) {
      return NextResponse.json({
        success: false,
        error: `Missing credentials: \${credsCheck.missing.join(', ')}`,
        missingCredentials: credsCheck.missing
      }, { status: 400 });
    }

    if (!services || !locations) {
      return NextResponse.json({ success: false, error: 'Services and locations are required' }, { status: 400 });
    }

    const servicesList: string[] = Array.isArray(services) ? services : [services];
    const locationsList: string[] = Array.isArray(locations) ? locations : [locations];

    let allProcessedLeads: ProcessedLead[] = [];

    for (const service of servicesList) {
      for (const location of locationsList) {
        try {
          const isSimpleSearch = servicesList.length === 1 && locationsList.length === 1;
          let allMapLeads: BasicLead[] = [];

          if (isSimpleSearch) {
            allMapLeads = await searchGoogleMapsBusiness(service, location, serpApiKeys, 'basic');
          } else {
            const results = await Promise.all([
              searchGoogleMapsBusiness(service, location, serpApiKeys, 'basic'),
              searchGoogleMapsBest(service, location, serpApiKeys),
              searchGoogleMapsTop(service, location, serpApiKeys),
              searchGoogleMapsCompanies(service, location, serpApiKeys),
              searchGoogleMapsServices(service, location, serpApiKeys)
            ]);

            allMapLeads = deduplicateLeads(results.flat());
          }

          const processedLeads = formatGoogleMapsLeads(allMapLeads, service, location);
          allProcessedLeads = allProcessedLeads.concat(processedLeads);
          await rateLimit();
        } catch (error) {
          console.error(`❌ Error processing \${service} in \${location}:`, error);
        }
      }
    }

    const finalLeads = allProcessedLeads.slice(0, parseInt(leadQuantity.toString()));
    let savedCount = 0;

    for (const leadData of finalLeads) {
      try {
        // Check if lead already exists using Prisma
        const existingLead = await prisma.lead.findFirst({
          where: {
            OR: [
              { email: leadData.email !== '' ? leadData.email : undefined },
              { AND: [{ name: leadData.name }, { company: leadData.company }] }
            ]
          }
        });

        if (!existingLead && leadData.name && leadData.company) {
          await prisma.lead.create({
            data: {
              name: leadData.name,
              company: leadData.company,
              email: leadData.email || '',
              phone: leadData.phone || '',
              website: leadData.website || '',
              linkedinProfile: leadData.linkedinProfile || '',
              notes: leadData.description || '',
              location: leadData.location || '',
              status: 'active',
              source: leadData.source || 'google-maps-leads',
              searchService: leadData.searchService || '',
              searchLocation: leadData.searchLocation || '',
              tags: leadData.tags || [],
              assignedTo: finalUserId,
              leadsCreatedBy: finalUserId,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          savedCount++;
        }
      } catch (saveError) {
        console.error(`❌ Error saving lead \${leadData.name}:`, saveError);
      }
    }

    const isSimpleSearch = servicesList.length === 1 && locationsList.length === 1;
    const serpCoinsPerCombination = isSimpleSearch ? 1 : 5;
    const totalSerpCoins = servicesList.length * locationsList.length * serpCoinsPerCombination;

    return NextResponse.json({
      success: true,
      leads: finalLeads,
      message: `Successfully collected \${finalLeads.length} leads and saved \${savedCount} to database using \${totalSerpCoins} SERP coins`,
      stats: {
        totalLeads: finalLeads.length,
        savedLeads: savedCount,
        skippedDuplicates: finalLeads.length - savedCount,
        totalSerpCoins
      }
    });

  } catch (error: any) {
    console.error('Normal lead collection error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to collect normal leads' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    message: 'Google Maps Lead Collection API',
    description: 'Cost-optimized real business lead collection'
  });
} 