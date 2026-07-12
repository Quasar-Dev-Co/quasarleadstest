import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const userId = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { leadIds } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No leads to delete" },
        { status: 400 }
      );
    }

    const filteredLeadIds = leadIds
      .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0);

    if (filteredLeadIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid lead IDs to delete" },
        { status: 400 }
      );
    }

    // Delete leads using Prisma
    const result = await prisma.lead.deleteMany({
      where: {
        id: { in: filteredLeadIds },
        OR: [
          { assignedTo: userId },
          { leadsCreatedBy: userId }
        ]
      }
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.count} leads`,
      deletedCount: result.count
    });
  } catch (error) {
    console.error("Error deleting leads:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete leads", error: String(error) },
      { status: 500 }
    );
  }
} 