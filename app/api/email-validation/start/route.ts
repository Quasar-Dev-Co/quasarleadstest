import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { userId, leadIds } = await request.json();
    if (!userId) return NextResponse.json({ error: 'User ID is required' }, { status: 401 });
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'Please select at least one lead to re-check.' }, { status: 400 });
    }

    const uniqueLeadIds = Array.from(new Set(leadIds.map((id: any) => String(id || '').trim()).filter(Boolean)));
    if (uniqueLeadIds.length === 0) {
      return NextResponse.json({ error: 'Please select at least one valid lead ID to re-check.' }, { status: 400 });
    }

    const whereClause = {
      id: { in: uniqueLeadIds },
      OR: [{ leadsCreatedBy: userId }, { assignedTo: userId }],
      status: 'active',
    };

    const leadsToValidate = await prisma.lead.count({ where: whereClause });

    if (leadsToValidate === 0) {
      return NextResponse.json({
        success: true,
        message: 'No selected active leads were eligible for re-check.',
        leadsToValidate: 0
      });
    }

    await prisma.lead.updateMany({
      where: whereClause,
      data: {
        emailValidationStatus: 'notScanned',
        emailValidationCheckedAt: null,
        emailValidationDetails: Prisma.JsonNull
      }
    });

    return NextResponse.json({
      success: true,
      message: `Email re-check started for ${leadsToValidate} selected lead(s).`,
      leadsToValidate,
      info: 'Cron job will process re-checks in batches of 20 every 3 minutes'
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
