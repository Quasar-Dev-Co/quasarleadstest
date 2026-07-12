import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import { prisma } from '@/lib/prisma';
import {
  enrichCompanyProfilesBatch,
  resolveCompanyEnrichmentCredentials,
} from '@/lib/companyEnrichment';

type InputItem = { index: number; company: string; website?: string | null; location?: string | null };
type Lead = {
  index: number;
  company_name: string;
  company_email?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  hr_name?: string | null;
  hr_email?: string | null;
  executive_name?: string | null;
  executive_email?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemsRaw = body?.items || body?.companies || [];
    const items: InputItem[] = itemsRaw.map((c: any, idx: number) => {
      if (typeof c === 'object' && c.company) {
        return {
          index: c.index ?? idx,
          company: String(c.company),
          website: c.website ? String(c.website) : null,
          location: c.location ? String(c.location) : null
        };
      }
      return { index: idx, company: String(c) };
    });
    const userId = body?.userId;

    if (!items.length || !userId) return NextResponse.json({ success: false, error: 'Companies and userId required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credentials: true } });
    const credentials = (user?.credentials as Record<string, any>) || {};
    const availableKeys = resolveCompanyEnrichmentCredentials(credentials);
    if (availableKeys.serpApiKeys.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing SERPAPI_KEY.' },
        { status: 400 }
      );
    }

    const limited = items.slice(0, 10);

    const batch = await enrichCompanyProfilesBatch(
      limited.map((item) => ({
        index: Number(item.index),
        companyName: item.company,
        website: item.website || null,
        location: item.location || null,
      })),
      credentials,
      {
        preferredProvider: 'serpapi',
        allowFallback: false,
      }
    );

    const results: Lead[] = batch.results.map((row) => ({
      index: row.index,
      ...row.lead,
    }));

    const failures: Array<{ index: number; company: string; error: string }> = batch.failures.map((f) => ({
      index: f.index,
      company: f.companyName,
      error: f.error,
    }));

    const providersUsed = Array.from(new Set(batch.results.map((row) => row.provider)));

    if (results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to enrich all companies in batch',
          failures,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
      failures,
      providersUsed,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}