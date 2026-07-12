import { NextRequest, NextResponse } from 'next/server';
import { getJson } from 'serpapi';
import { prisma } from '@/lib/prisma';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  getApiKeysFromCredentials,
  isSerpApiRotationError,
  withApiKeyRotation,
} from '@/lib/api-key-rotation';

// Helper to validate required credential keys
function requireCredentials(creds: Record<string, string | undefined>, keys: string[]): { ok: boolean; missing: string[] } {
  const missing = keys.filter((k) => !creds[k]);
  return { ok: missing.length === 0, missing };
}

interface ScrapedData {
  url: string;
  title: string;
  metaDescription: string;
  bodyText: string;
  emails: string[];
  phones: string[];
  linkedinProfiles: string[];
  aboutContent: string;
  servicesContent: string;
  contactContent: string;
  hasContactPage: boolean;
  hasAboutPage: boolean;
  businessType: string;
  extractionSuccess: boolean;
}

interface SimpleLead {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  scrapedData: ScrapedData;
  emailFound: boolean;
  emails: string[];
  source: 'organic' | 'local';
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
  searchService: string;
  searchLocation: string;
  tags: string[];
  isHighValue: boolean;
}

// Enhanced email extraction with better accuracy
function extractBusinessEmails(html: string, text: string, domain: string): string[] {
  const emails = new Set<string>();

  const emailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/g
  ];

  const content = html + ' ' + text;

  emailPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        let email = match.replace('mailto:', '').trim();
        if (email && isValidBusinessEmail(email, domain)) {
          emails.add(email.toLowerCase());
        }
      });
    }
  });

  return Array.from(emails);
}

// Enhanced email validation
function isValidBusinessEmail(email: string, domain: string): boolean {
  if (!email || !email.includes('@') || !email.includes('.')) return false;

  const emailLower = email.toLowerCase();
  const invalidPatterns = [
    'example.com', 'test.com', 'yoursite.com', 'yourdomain.com',
    'placeholder.com', 'sample.com', 'demo.com', 'tempuri.org',
    '.jpg', '.png', '.pdf', '.gif', '.jpeg', '.svg', '.doc', '.docx'
  ];

  if (invalidPatterns.some(pattern => emailLower.includes(pattern))) {
    return false;
  }

  return true;
}

// Enhanced phone extraction
function extractPhones(text: string): string[] {
  const phones = new Set<string>();
  const phonePatterns = [
    /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g
  ];

  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
          phones.add(match.trim());
        }
      });
    }
  });

  return Array.from(phones).slice(0, 3);
}

// Extract LinkedIn profiles
function extractLinkedInProfiles(html: string): string[] {
  const profiles = new Set<string>();
  const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9\-]+)/g;

  let match;
  while ((match = linkedinRegex.exec(html)) !== null) {
    const fullUrl = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
    profiles.add(fullUrl);
  }

  return Array.from(profiles).slice(0, 2);
}

// Clean domain helper
function cleanDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
  }
}

// Enhanced website scraping
async function scrapeWebsiteForEmails(url: string, retryCount = 0): Promise<ScrapedData> {
  const defaultData: ScrapedData = {
    url, title: 'Error', metaDescription: '', bodyText: '', emails: [], phones: [],
    linkedinProfiles: [], aboutContent: '', servicesContent: '', contactContent: '',
    hasContactPage: false, hasAboutPage: false, businessType: 'Unknown', extractionSuccess: false
  };

  try {
    const response = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = response.data;
    const $ = cheerio.load(html);
    $('script, style').remove();

    const title = $('title').text().trim() || 'Unknown Company';
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const domain = cleanDomain(url);
    const emails = extractBusinessEmails(html, bodyText, domain);
    const phones = extractPhones(bodyText);
    const linkedinProfiles = extractLinkedInProfiles(html);

    return {
      url, title, metaDescription: '', bodyText: bodyText.slice(0, 1000),
      emails, phones, linkedinProfiles, aboutContent: '', servicesContent: '',
      contactContent: '', hasContactPage: false, hasAboutPage: false,
      businessType: 'Business', extractionSuccess: emails.length > 0
    };
  } catch (error) {
    if (retryCount < 1) return scrapeWebsiteForEmails(url, retryCount + 1);
    return defaultData;
  }
}

// Format leads for database
function formatLeadsForDatabase(leads: SimpleLead[], service: string, location: string): ProcessedLead[] {
  return leads.map(lead => ({
    name: lead.emails[0]?.split('@')[0].replace(/[.\-_]/g, ' ') || 'Contact',
    company: lead.scrapedData.title.split(/[|\-–]/)[0].trim(),
    email: lead.emails[0] || '',
    phone: lead.scrapedData.phones[0] || '',
    website: lead.url,
    linkedinProfile: lead.scrapedData.linkedinProfiles[0] || '',
    notes: `${lead.scrapedData.businessType} company in ${location}`,
    location,
    status: 'active',
    source: lead.source || 'simple-search',
    searchService: service,
    searchLocation: location,
    tags: [service.toLowerCase(), location.toLowerCase()],
    isHighValue: false
  }));
}

// Simple search with only 1 SERP API call per service-location
async function searchSimpleLeads(service: string, location: string, serpApiKeys: string[]): Promise<SimpleLead[]> {
  const leads: SimpleLead[] = [];
  if (serpApiKeys.length === 0) throw new Error('SERPAPI_KEY is not configured');

  try {
    const searchQuery = `${service} company "${location}"`;
    const rotated = await withApiKeyRotation(
      serpApiKeys,
      async (apiKey) => {
        const searchResults = await getJson({ engine: 'google', api_key: apiKey, q: searchQuery, location, num: 20 });
        if ((searchResults as any)?.error) {
          throw { status: 400, data: searchResults, message: String((searchResults as any).error) };
        }
        return searchResults;
      },
      isSerpApiRotationError,
      'SERPAPI'
    );

    if (rotated.usedIndex > 0) {
      console.warn(`⚠️ SERPAPI rotated to key #${rotated.usedIndex + 1} for simple lead search`);
    }

    const searchResults = rotated.value as any;
    const organicResults = searchResults.organic_results || [];

    for (const result of organicResults.slice(0, 5)) {
      try {
        const domain = cleanDomain(result.link);
        const existing = await prisma.lead.count({ where: { website: { contains: domain } } });
        if (existing > 0) continue;
        const scrapedData = await scrapeWebsiteForEmails(result.link);
        if (scrapedData.extractionSuccess) {
          leads.push({ url: result.link, title: result.title, snippet: result.snippet || '', domain, scrapedData, emailFound: true, emails: scrapedData.emails, source: 'organic' });
        }
      } catch (e) { }
    }
    return leads;
  } catch (error) {
    console.error('❌ Error in simple search:', error);
    return [];
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { services, locations, userId } = body;

    let serpApiKeys: string[] = [];
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { credentials: true } });
      if (user && user.credentials) {
        serpApiKeys = getApiKeysFromCredentials(user.credentials as Record<string, any>, 'SERPAPI_KEY', 'SERPAPI_ACCOUNTS');
      }
    }
    const check = requireCredentials({ SERPAPI_KEY: serpApiKeys[0] }, ['SERPAPI_KEY']);
    if (!check.ok) return NextResponse.json({ success: false, error: `Missing credentials: ${check.missing.join(', ')}` }, { status: 400 });

    if (!services || !locations) return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });

    const servicesList = Array.isArray(services) ? services : services.split(',').map((s: string) => s.trim());
    const locationsList = Array.isArray(locations) ? locations : locations.split(',').map((l: string) => l.trim());

    let allProcessedLeads: ProcessedLead[] = [];
    for (const service of servicesList) {
      for (const location of locationsList) {
        const simpleLeads = await searchSimpleLeads(service, location, serpApiKeys);
        allProcessedLeads = [...allProcessedLeads, ...formatLeadsForDatabase(simpleLeads, service, location)];
      }
    }

    for (const leadData of allProcessedLeads) {
      try {
        await prisma.lead.create({ data: { ...leadData, leadsCreatedBy: userId, assignedTo: userId } });
      } catch (e) { }
    }

    return NextResponse.json({ success: true, leads: allProcessedLeads, statistics: { totalLeadsFound: allProcessedLeads.length } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ success: true, message: 'Simple Leads API with Prisma' });
}
