import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId } = body || {};

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }

    const leadDoc = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { company: true, assignedTo: true, leadsCreatedBy: true }
    });

    if (!leadDoc) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }
    if (!leadDoc.company) {
      return NextResponse.json({ success: false, error: 'Lead has no company name to enrich' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const userId = leadDoc.assignedTo || leadDoc.leadsCreatedBy || '';

    const resp = await fetch(`\${appUrl}/api/internal/enrich-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: leadDoc.company, userId })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return NextResponse.json({ success: false, error: `Enrichment failed: \${err}` }, { status: 502 });
    }

    const data = await resp.json();
    const enriched = data?.lead;
    if (!enriched) {
      return NextResponse.json({ success: false, error: 'No enrichment data returned' }, { status: 500 });
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        authInformation: {
          company_name: enriched.company_name || '',
          company_email: enriched.company_email || '',
          owner_name: enriched.owner_name || '',
          owner_email: enriched.owner_email || '',
          manager_name: enriched.manager_name || '',
          manager_email: enriched.manager_email || '',
          hr_name: enriched.hr_name || '',
          hr_email: enriched.hr_email || '',
          executive_name: enriched.executive_name || '',
          executive_email: enriched.executive_email || ''
        } as any,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to enrich author info' }, { status: 500 });
  }
}
