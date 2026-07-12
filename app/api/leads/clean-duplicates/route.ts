import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 401 });
    }

    // Find all leads for this user
    const allLeads = await prisma.lead.findMany({
      where: {
        OR: [
          { leadsCreatedBy: userId },
          { assignedTo: userId }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    const emailGroups = new Map<string, any[]>();
    for (const lead of allLeads) {
      const emailLower = (lead.email || '').toLowerCase().trim();
      if (!emailGroups.has(emailLower)) {
        emailGroups.set(emailLower, []);
      }
      emailGroups.get(emailLower)!.push(lead);
    }

    const leadsToDelete: string[] = [];
    const duplicatesInfo: any[] = [];

    for (const [email, leads] of emailGroups.entries()) {
      if (leads.length > 1) {
        const [keepLead, ...deleteLeads] = leads;

        duplicatesInfo.push({
          email,
          count: leads.length,
          kept: { id: keepLead.id, name: keepLead.name, company: keepLead.company },
          deleted: deleteLeads.map(l => ({ id: l.id, name: l.name, company: l.company }))
        });

        leadsToDelete.push(...deleteLeads.map(l => l.id));
      }
    }

    if (leadsToDelete.length === 0) {
      return NextResponse.json({ success: true, message: 'No duplicates found', deleted: 0 });
    }

    const deleteResult = await prisma.lead.deleteMany({
      where: { id: { in: leadsToDelete } }
    });

    return NextResponse.json({
      success: true,
      message: `Removed \${deleteResult.count} duplicate leads`,
      deleted: deleteResult.count,
      details: duplicatesInfo
    });

  } catch (error: any) {
    console.error('❌ Failed to clean duplicates:', error);
    return NextResponse.json({ error: 'Failed to clean duplicates', details: error.message }, { status: 500 });
  }
}
