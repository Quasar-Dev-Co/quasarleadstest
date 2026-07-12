import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	enrichCompanyProfilesWithGemini,
	resolveGeminiEnrichmentCredentials,
	GEMINI_ENRICHMENT_GROUP_SIZE,
} from '@/lib/geminiEnrichment';

export const runtime = 'nodejs';
const ENRICHMENT_GROUP_SIZE = GEMINI_ENRICHMENT_GROUP_SIZE; // 10 companies per Gemini interaction
const SERPAPI_QUOTA_COOLDOWN_MINUTES = 30;
const SERPAPI_QUOTA_ERROR_PATTERN = /out of searches|quota|rate limit|too many requests|insufficient|429/i;

function isSerpApiQuotaError(message: string): boolean {
	return SERPAPI_QUOTA_ERROR_PATTERN.test(String(message || '').toLowerCase());
}

type Enriched = {
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

// GET endpoint uses batch processing with batchSize=10 for Gemini Google Search enrichment.
export async function GET(request: NextRequest) {
	// Default to processing 10 leads for GET (cron job), but allow override via query param
	const searchParams = request.nextUrl.searchParams;
	const requestedBatchSize = parseInt(searchParams.get('batchSize') || String(ENRICHMENT_GROUP_SIZE), 10);
	const batchSize = Math.max(1, Math.min(50, Number.isFinite(requestedBatchSize) ? requestedBatchSize : ENRICHMENT_GROUP_SIZE));
	const userId = searchParams.get('userId') || '';

	// Convert GET to POST-style processing
	const mockBody = { batchSize, userId };
	const mockRequest = {
		...request,
		url: request.url,
		headers: request.headers,
		json: () => Promise.resolve(mockBody),
		nextUrl: request.nextUrl
	} as NextRequest;

	return POST(mockRequest);
}

// Batch enrichment endpoint: process N temporary leads at a time (default 10) via Gemini
export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => ({} as any));
		const batchSizeRaw = body?.batchSize ?? request.nextUrl.searchParams.get('batchSize');
		const requestUserId = body?.userId ?? request.nextUrl.searchParams.get('userId') ?? '';
		const requestedBatchSize = parseInt(String(batchSizeRaw || ENRICHMENT_GROUP_SIZE), 10);
		const batchSize = Math.max(1, Math.min(50, Number.isFinite(requestedBatchSize) ? requestedBatchSize : ENRICHMENT_GROUP_SIZE));

		// CRITICAL FIX: Process leads per user to get correct SERPAPI key
		// If no userId provided, pick the first user with pending leads
		let userId = requestUserId;

		if (!userId) {
			// Find first user with pending leads
			const firstLead = await prisma.temporaryLead.findFirst({
				where: { isAuthCheck: false },
				orderBy: { createdAt: 'asc' }
			});
			if (!firstLead) {
				return NextResponse.json({ success: true, message: 'No pending temporary leads', remaining: 0 });
			}
			userId = firstLead.userId;
			console.log(`🔍 Processing leads for user: ${firstLead.userId}`);
		}

		// Fetch a batch of pending temporary leads FOR THIS USER ONLY
		const temps = await prisma.temporaryLead.findMany({
			where: { isAuthCheck: false, userId },
			orderBy: { createdAt: 'asc' },
			take: batchSize
		});
		if (!temps || temps.length === 0) {
			const remaining = await prisma.temporaryLead.count({ where: { isAuthCheck: false } });
			return NextResponse.json({ success: true, message: 'No pending temporary leads for this user', remaining });
		}

		console.log(`📦 Processing batch of ${temps.length} leads for user: ${userId}`);
		let processed = 0;
		let skipped = 0;
		let failed = 0;
		let duplicatesFound = 0;
		const details: Array<{ company: string; status: 'processed' | 'skipped' | 'failed'; reason?: string }> = [];

		const user = await prisma.user.findUnique({ where: { id: userId }, select: { credentials: true } });
		const credentials = (user?.credentials as Record<string, any>) || {};
		const pauseUntilRaw = typeof credentials.SERPAPI_QUOTA_PAUSE_UNTIL === 'string'
			? credentials.SERPAPI_QUOTA_PAUSE_UNTIL
			: '';
		if (pauseUntilRaw) {
			const pauseUntilMs = Date.parse(pauseUntilRaw);
			if (!Number.isNaN(pauseUntilMs) && pauseUntilMs > Date.now()) {
				const remaining = await prisma.temporaryLead.count({ where: { isAuthCheck: false, userId } });
				console.warn(`⏸️ Skipping auth-check for user ${userId} due to enrichment quota cooldown until ${pauseUntilRaw}`);
				return NextResponse.json({
					success: true,
					message: `Enrichment quota cooldown active until ${pauseUntilRaw}`,
					stats: {
						requested: temps.length,
						processed: 0,
						skipped: 0,
						failed: 0,
						deferred: temps.length,
						duplicatesFound: 0,
						newLeadsProcessed: 0,
						remaining,
						coinsUsed: 0,
						oldSystemCoins: temps.length,
						coinsSaved: temps.length,
						savingsPercent: 100,
						batchSize,
					},
					details: temps.map((t) => ({
						company: t.company,
						status: 'skipped' as const,
						reason: `Deferred: enrichment quota cooldown until ${pauseUntilRaw}`,
					})),
				});
			}
		}

		const geminiCreds = resolveGeminiEnrichmentCredentials(credentials);
		if (!geminiCreds.geminiApiKey) {
			console.error(`❌ Missing GEMINI_API_KEY for user ${userId}`);
			return NextResponse.json(
				{ success: false, error: `Missing GEMINI_API_KEY for user ${userId}. Add it in Account Settings > Credentials.` },
				{ status: 400 }
			);
		}

		// 🔍 DUPLICATE PREVENTION: Check for existing leads BEFORE enrichment processing
		console.log(`🔍 Checking for duplicates among ${temps.length} leads...`);

		const duplicateChecks = await Promise.all(
			temps.map(async (temp) => {
				const existing = await prisma.lead.findFirst({
					where: {
						company: { equals: temp.company, mode: 'insensitive' },
						location: { equals: temp.location, mode: 'insensitive' }
					}
				});

				return { temp, isDuplicate: !!existing };
			})
		);

		// Filter out duplicates - only process NEW leads
		const newLeads = duplicateChecks.filter(check => !check.isDuplicate).map(check => check.temp);
		duplicatesFound = duplicateChecks.length - newLeads.length;
		const duplicateIds = duplicateChecks.filter(check => check.isDuplicate).map(check => check.temp.id);

		console.log(`✅ Duplicate check complete: ${newLeads.length} new leads, ${duplicatesFound} duplicates skipped`);

		// Mark duplicates as processed to avoid reprocessing
		if (duplicatesFound > 0) {
			await prisma.temporaryLead.updateMany({
				where: { id: { in: duplicateIds } },
				data: { isAuthCheck: true }
			});
			console.log(`🔒 Marked ${duplicatesFound} duplicates as checked`);
		}

		// Calculate coin savings
		const oldSystemCoins = newLeads.length; // Old system: 1 enrichment call per new lead
		let coinsUsed = 0; // New system: 1 enrichment call per chunk of up to 10 leads
		let coinsSaved = oldSystemCoins - coinsUsed;
		let savingsPercent = oldSystemCoins > 0 ? Math.round((coinsSaved / oldSystemCoins) * 100) : 0;

		console.log(`💰 Cost baseline: old=${oldSystemCoins} calls, new starts at ${coinsUsed} calls`);

		// Handle case where ALL leads are duplicates
		if (newLeads.length === 0) {
			console.log(`⚠️ All ${temps.length} leads were duplicates - no enrichment call needed!`);

			return NextResponse.json({
				success: true,
				message: `All ${temps.length} leads were duplicates - saved ${coinsSaved} enrichment calls!`,
				stats: {
					requested: temps.length,
					processed: 0,
					skipped: 0,
					failed: 0,
					duplicatesFound,
					remaining: await prisma.temporaryLead.count({ where: { isAuthCheck: false } }),
					coinsUsed: 0,
					oldSystemCoins,
					coinsSaved,
					savingsPercent,
					batchSize
				},
				details: duplicateChecks.filter(c => c.isDuplicate).map(c => ({
					company: c.temp.company,
					status: 'skipped' as const,
					reason: 'Duplicate - already exists in database'
				}))
			});
		}

		// Enrich NEW leads in grouped batches of up to 10 companies per SerpApi AI Mode request.
		const results: Array<any> = [];
		const batchFailures: Array<{ index: number; company: string; error: string }> = [];
		const attemptedIndexes = new Set<number>();
		let quotaExhausted = false;
		let quotaErrorMessage = '';
		let deferred = 0;

		for (let start = 0; start < newLeads.length; start += ENRICHMENT_GROUP_SIZE) {
			if (quotaExhausted) {
				break;
			}

			const chunk = newLeads.slice(start, start + ENRICHMENT_GROUP_SIZE);
			console.log(
				`📚 Batch auth check request: ${chunk.length} companies (indexes ${start}-${start + chunk.length - 1})`
			);
			const batchInput = chunk.map((t, offset) => ({
				index: start + offset,
				companyName: t.company,
				website: t.website || null,
				location: t.location || null,
			}));

			try {
				coinsUsed += 1;
				for (const item of batchInput) {
					attemptedIndexes.add(item.index);
				}

				const batch = await enrichCompanyProfilesWithGemini(
					batchInput,
					credentials
				);

				for (const enriched of batch.results) {
					results.push({
						index: enriched.index,
						...enriched.lead,
					});
				}

				for (const failure of batch.failures) {
					const fallbackCompany = newLeads[failure.index]?.company || failure.companyName;
					batchFailures.push({ index: failure.index, company: fallbackCompany, error: failure.error });
				}

				const allFailedInChunk = batch.results.length === 0 && batch.failures.length === batchInput.length;
				const quotaFailure = allFailedInChunk
					? batch.failures.find((failure) => isSerpApiQuotaError(failure.error))
					: null;

				if (quotaFailure) {
					quotaExhausted = true;
					quotaErrorMessage = quotaFailure.error;
					console.error(`❌ Enrichment quota exhausted. Stopping further auth-check batches: ${quotaErrorMessage}`);
				}
			} catch (error: any) {
				const errMessage = error?.message || 'Unexpected batch enrichment error';
				for (const item of batchInput) {
					batchFailures.push({
						index: item.index,
						company: item.companyName,
						error: errMessage,
					});
				}

				if (isSerpApiQuotaError(errMessage)) {
					quotaExhausted = true;
					quotaErrorMessage = errMessage;
					console.error(`❌ Enrichment quota exhausted. Stopping further auth-check batches: ${quotaErrorMessage}`);
				}
			}
		}

		coinsSaved = oldSystemCoins - coinsUsed;
		savingsPercent = oldSystemCoins > 0 ? Math.round((coinsSaved / oldSystemCoins) * 100) : 0;
		console.log(`💰 Cost savings: ${coinsSaved} calls saved (${savingsPercent}% reduction)`);

		if (quotaExhausted) {
			const pauseUntil = new Date(Date.now() + SERPAPI_QUOTA_COOLDOWN_MINUTES * 60 * 1000).toISOString();
			const nextCredentials = {
				...credentials,
				SERPAPI_QUOTA_PAUSE_UNTIL: pauseUntil,
			};

			await prisma.user.update({
				where: { id: userId },
				data: { credentials: nextCredentials },
			});

			console.warn(
				`⏸️ Set enrichment quota cooldown for user ${userId} until ${pauseUntil}. Remaining leads will stay pending.`
			);
		}

		console.log(`📊 Enrichment results: ${results.length} success, ${batchFailures.length} failed`);
		if (batchFailures.length > 0) {
			console.error(`❌ Enrichment failures (${batchFailures.length}):`, batchFailures);
		}

		// Merge results back to NEW leads by index
		const idsToMarkChecked = new Set<string>(duplicateIds);

		for (let idx = 0; idx < newLeads.length; idx++) {
			const t = newLeads[idx];

			if (!attemptedIndexes.has(idx)) {
				deferred++;
				details.push({
					company: t.company,
					status: 'skipped',
					reason: quotaExhausted
						? `Deferred: enrichment quota exhausted (${quotaErrorMessage || 'out of searches'})`
						: 'Deferred: not attempted in this run',
				});
				continue;
			}

			try {
				const enriched = results.find(r => Number(r.index) === idx) as Enriched | undefined;
				if (!enriched) {
					const failure = batchFailures.find((f) => Number(f.index) === idx);
					failed++;
					idsToMarkChecked.add(t.id);
					details.push({
						company: t.company,
						status: 'failed',
						reason: failure?.error || 'No result from batch'
					});
					if (failure) {
						console.error(`❌ Enrichment failed for ${t.company}: ${failure.error}`);
					} else {
						console.error(`❌ Enrichment failed for ${t.company}: No result from batch`);
					}
					continue;
				}

				const companyEmail = [
					enriched.company_email,
					t.email,
					enriched.owner_email,
					enriched.executive_email,
					enriched.manager_email,
					enriched.hr_email,
				]
					.map((value) => String(value || '').trim())
					.find((value) => !!value) || '';

				const ownerName = (enriched.owner_name || '').trim() || `Hoi ${(enriched.company_name || t.company).trim()} Team`;
				if (!companyEmail) {
					console.warn(`⚠️ No direct email found for ${t.company}; saving lead with empty email.`);
				}

				await prisma.lead.create({
					data: {
						name: t.name,
						company: enriched.company_name || t.company,
						location: t.location,
						website: t.website,
						email: companyEmail,
						phone: t.phone,
						linkedinProfile: t.linkedinProfile,
						status: 'active',
						googleAds: !!t.googleAds,
						googleAdsChecked: true,
						organicRanking: t.organicRanking,
						source: 'serp-api',
						searchService: t.searchService,
						searchLocation: t.searchLocation,
						address: t.address,
						rating: t.rating ? parseFloat(t.rating) : null,
						reviews: t.reviews ? parseInt(t.reviews) : null,
						authInformation: {
							company_name: enriched.company_name || '',
							company_email: companyEmail,
							owner_name: ownerName,
							owner_email: enriched.owner_email || '',
							manager_name: enriched.manager_name || '',
							manager_email: enriched.manager_email || '',
							hr_name: enriched.hr_name || '',
							hr_email: enriched.hr_email || '',
							executive_name: enriched.executive_name || '',
							executive_email: enriched.executive_email || ''
						},
						assignedTo: t.userId,
						leadsCreatedBy: t.userId,
					}
				});

				processed++;
				idsToMarkChecked.add(t.id);
				console.log(`✅ Successfully saved lead to DB: ${t.company}`);
				details.push({
					company: t.company,
					status: 'processed',
					reason: companyEmail ? undefined : 'Saved without direct email',
				});
			} catch (err: any) {
				failed++;
				idsToMarkChecked.add(t.id);
				console.error(`❌ Failed to save lead ${t.company} to DB:`, err?.message || err);
				details.push({ company: t.company, status: 'failed', reason: err?.message || 'Unexpected error' });
			}
		}

		if (idsToMarkChecked.size > 0) {
			await prisma.temporaryLead.updateMany({
				where: { id: { in: Array.from(idsToMarkChecked) } },
				data: { isAuthCheck: true }
			});
		}

		console.log(`🏁 Batch complete. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}, Deferred: ${deferred}`);

		const remaining = await prisma.temporaryLead.count({ where: { isAuthCheck: false } });

		return NextResponse.json({
			success: true,
			message: `✅ Batch processed ${newLeads.length} new leads (${duplicatesFound} duplicates skipped) in ${coinsUsed} enrichment call${coinsUsed === 1 ? '' : 's'} - saved ${coinsSaved} calls (${savingsPercent}% savings)`,
			stats: {
				requested: temps.length,
				processed,
				skipped,
				failed,
				deferred,
				duplicatesFound,
				newLeadsProcessed: newLeads.length,
				remaining,
				coinsUsed,
				oldSystemCoins,
				coinsSaved,
				savingsPercent,
				batchSize
			},
			details
		});
	} catch (error: any) {
		console.error('process-temporary-leads batch error:', error);
		return NextResponse.json({ success: false, error: error.message || 'Unexpected error' }, { status: 500 });
	}
}


