import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { GoogleAdsDetector } from '@/lib/googleAdsDetector';
import { enrichLeadsWithOwners } from '@/lib/leadEnrichment';

const MAX_EXECUTION_TIME = 90000; // 90 seconds

function isCronAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return process.env.NODE_ENV === 'development';
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  return token === expectedSecret;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return await processNextJob();
  } catch (error: any) {
    return handleJobError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return await processNextJob();
}

async function processNextJob() {
  const job = await prisma.jobQueue.findFirst({
    where: { status: { in: ['pending', 'running'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
  });

  if (!job) return NextResponse.json({ success: true, message: 'No jobs' });

  if (job.status === 'pending') {
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: 'running', startedAt: new Date(), currentStep: 0 }
    });
  }

  const services = job.services;
  const locations = job.locations;
  const totalSteps = services.length * locations.length;

  if (job.currentStep >= totalSteps) {
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: 'completed', completedAt: new Date(), progress: 100 }
    });
    return NextResponse.json({ success: true, status: 'completed' });
  }

  const sInd = Math.floor(job.currentStep / locations.length);
  const lInd = job.currentStep % locations.length;
  const service = services[sInd];
  const location = locations[lInd];

  await prisma.jobQueue.update({
    where: { id: job.id },
    data: { progressMessage: `Processing \${service} in \${location}`, currentService: service, currentLocation: location }
  });

  try {
    const leads = await collectLeads(service, location, job.leadQuantity, job.userId || '');
    const enriched = await enrichLeadsWithOwners(leads, job.userId || 'admin');
    let savedCount = 0;

    for (const lead of enriched) {
      if (!lead.email) continue;
      const jobUserId = job.userId || 'admin';
      const existing = await prisma.lead.findFirst({
        where: {
          AND: [
            {
              OR: [
                { assignedTo: jobUserId },
                { leadsCreatedBy: jobUserId }
              ]
            },
            {
              OR: [{ email: lead.email }, { company: lead.company }]
            }
          ]
        }
      });

      if (!existing) {
        await prisma.lead.create({
          data: {
            ...lead,
            assignedTo: job.userId || 'admin',
            leadsCreatedBy: job.userId || 'admin',
            googleAds: lead.isRunningAds || false,
            googleAdsChecked: true
          } as any
        });
        savedCount++;
      }
    }

    await prisma.jobQueue.update({
      where: { id: job.id },
      data: {
        currentStep: job.currentStep + 1,
        totalLeadsCollected: { increment: savedCount },
        progress: Math.round(((job.currentStep + 1) / totalSteps) * 100)
      }
    });

    return NextResponse.json({ success: true, step: job.currentStep + 1 });
  } catch (error: any) {
    return handleJobError(error, job.id);
  }
}

async function collectLeads(service: string, location: string, qty: number, userId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resp = await fetch(`${appUrl}/api/findleads-normal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ services: [service], locations: [location], leadQuantity: qty, userId })
  });
  if (!resp.ok) throw new Error('collect leads failed');
  const d = await resp.json();
  return d.leads || [];
}

async function handleJobError(error: any, id?: string) {
  if (id) await prisma.jobQueue.update({ where: { id }, data: { status: 'failed', errorMessage: error.message } });
  return NextResponse.json({ success: false, error: error.message }, { status: 500 });
}