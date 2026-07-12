import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import { prisma } from '@/lib/prisma';
import {
  enrichCompanyProfile,
  resolveCompanyEnrichmentCredentials,
} from '@/lib/companyEnrichment';

type Lead = {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companyName: string | undefined = body?.companyName ?? body?.company_name;
    const userId: string | undefined = typeof body?.userId === 'string' ? body.userId : undefined;
    const website: string | undefined = body?.website;
    const location: string | undefined = body?.location;
    if (!companyName || !userId) return NextResponse.json({ error: "companyName and userId required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credentials: true } });
    const credentials = (user?.credentials as Record<string, any>) || {};
    const availableKeys = resolveCompanyEnrichmentCredentials(credentials);
    if (availableKeys.serpApiKeys.length === 0) {
      return NextResponse.json(
        { error: 'Missing SERPAPI_KEY in user credentials.' },
        { status: 400 }
      );
    }

    const result = await enrichCompanyProfile(
      {
        companyName,
        website,
        location,
      },
      credentials,
      {
        preferredProvider: 'serpapi',
        allowFallback: false,
      }
    );

    const lead: Lead = result.lead;
    return NextResponse.json({ lead, provider: result.provider });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
