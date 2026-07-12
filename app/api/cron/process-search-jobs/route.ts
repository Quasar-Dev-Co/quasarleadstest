import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	getApiKeysFromCredentials,
	isSerpApiRotationError,
	withApiKeyRotation,
} from '@/lib/api-key-rotation';

export const runtime = 'nodejs';

type SerpResult = {
	name?: string;
	title?: string;
	company?: string;
	location?: string;
	website?: string;
	email?: string;
	phone?: string;
	linkedin?: string;
	address?: string;
	rating?: string;
	reviews?: string;
	googleAds?: boolean;
	organicRanking?: number;
};

export async function GET(_req: NextRequest) {
	try {
		// Pick the oldest pending search job
		const job = await prisma.searchJob.findFirst({ 
			where: { status: 'pending' },
			orderBy: { createdAt: 'asc' }
		});
		if (!job) {
			return NextResponse.json({ success: true, message: 'No pending search jobs' });
		}

		console.log(`🔍 Processing search job: ${job.service} in ${job.location}`);
		
		// Mark as processing
		await prisma.searchJob.update({ 
			where: { id: job.id },
			data: { 
				status: 'processing', 
				startedAt: new Date(),
				progress: 10 
			} 
		});

		try {
			// Load SERPAPI key from this job owner's Account Settings credentials.
			const user = await prisma.user.findUnique({
				where: { id: job.userId },
				select: { id: true, email: true, credentials: true }
			});

			if (!user) {
				throw new Error(`User not found for search job owner: ${job.userId}`);
			}

			const userCredentials = (user.credentials as Record<string, any>) || {};
			const serpApiKeys = getApiKeysFromCredentials(userCredentials, 'SERPAPI_KEY', 'SERPAPI_ACCOUNTS');

			if (serpApiKeys.length === 0) {
				console.error(`❌ Missing SERPAPI_KEY in Account Settings for user ${job.userId} (${user.email || 'unknown email'})`);
				throw new Error(`Missing SERPAPI_KEY in Account Settings for user ${job.userId}`);
			}

			console.log(`🔍 Processing: ${job.service} in ${job.location}`);

			// Update progress
			await prisma.searchJob.update({ where: { id: job.id }, data: { progress: 30 } });

			// Call SerpAPI (Google Maps) for this specific service+location
			const rotated = await withApiKeyRotation(
				serpApiKeys,
				async (apiKey) => {
					const params = new URLSearchParams({
						engine: 'google_maps',
						q: `${job.service} ${job.location}`,
						api_key: apiKey,
						hl: 'en'
					});

					const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
					const data = await resp.json().catch(() => ({}));

					if (!resp.ok) {
						throw { status: resp.status, data, message: `SerpAPI request failed: ${resp.status}` };
					}

					if (data?.error) {
						throw { status: 400, data, message: String(data.error) };
					}

					return data;
				},
				isSerpApiRotationError,
				'SERPAPI'
			);

			const data = rotated.value as any;
			if (rotated.usedIndex > 0) {
				console.warn(`⚠️ SERPAPI rotated to key #${rotated.usedIndex + 1} for user ${job.userId}`);
			}
			console.log(`📊 SerpAPI response for "${job.service} ${job.location}":`, {
				hasPlacesResults: !!data?.places_results,
				placesCount: data?.places_results?.length || 0,
				hasLocalResults: !!data?.local_results,
				localCount: data?.local_results?.length || 0
			});
			
			// Update progress
			await prisma.searchJob.update({ where: { id: job.id }, data: { progress: 60 } });

			// Parse results from places_results or local_results
			const placesResults = data?.places_results || data?.local_results || [];
			const results: SerpResult[] = Array.isArray(placesResults) ? placesResults.map((p: any, idx: number) => ({
				name: p.title,
				company: p.title,
				location: p?.address || job.location,
				website: p?.links?.website,
				phone: p?.phone,
				address: p?.address,
				rating: p?.rating?.toString?.(),
				reviews: p?.reviews?.toString?.(),
				googleAds: !!p?.ads || !!p?.sponsored,
				organicRanking: idx + 1
			})) : [];

			// Save to TemporaryLead with isAuthCheck: false
			let upsertedCount = 0;
			let modifiedCount = 0;
			
			for (const r of results.slice(0, 50)) {
				const company = r.company || r.name || 'Unknown';
				const location = r.location || job.location;
				
				const existing = await prisma.temporaryLead.findFirst({
					where: { company, location, userId: job.userId }
				});
				
				if (existing) {
					await prisma.temporaryLead.update({
						where: { id: existing.id },
						data: {
							isAuthCheck: false,
							name: r.name || r.company || 'Unknown',
							company,
							location,
							website: r.website,
							email: r.email,
							phone: r.phone,
							linkedinProfile: r.linkedin,
							googleAds: !!r.googleAds,
							googleAdsChecked: true,
							organicRanking: r.organicRanking,
							source: 'serp-api',
						searchService: job.service,
						searchLocation: job.location,
							address: r.address,
							rating: r.rating,
							reviews: r.reviews,
						}
					});
					modifiedCount++;
				} else {
					await prisma.temporaryLead.create({
						data: {
							isAuthCheck: false,
							userId: job.userId,
							name: r.name || r.company || 'Unknown',
							company,
							location,
							website: r.website,
							email: r.email,
							phone: r.phone,
							linkedinProfile: r.linkedin,
							googleAds: !!r.googleAds,
							googleAdsChecked: true,
							organicRanking: r.organicRanking,
							source: 'serp-api',
						searchService: job.service,
						searchLocation: job.location,
							address: r.address,
							rating: r.rating,
							reviews: r.reviews,
						}
					});
					upsertedCount++;
				}
			}
			
			if (results.length > 0) {
				console.log(`💾 Saved ${results.slice(0, 50).length} leads to TemporaryLead collection:`, {
					upserted: upsertedCount,
					modified: modifiedCount,
					matched: modifiedCount
				});
			} else {
				console.log(`⚠️ No leads to save for ${job.service} in ${job.location}`);
			}

			// Mark job as completed
			await prisma.searchJob.update({ 
				where: { id: job.id },
				data: { 
					status: 'completed',
					progress: 100,
					leadsFound: results.length,
					completedAt: new Date()
				} 
			});

			console.log(`✅ Search job completed: ${job.service} in ${job.location} - Found ${results.length} leads`);
			
			return NextResponse.json({ 
				success: true, 
				processed: `${job.service} in ${job.location}`,
				leadsFound: results.length 
			});

		} catch (error: any) {
			console.error('Search job processing error:', error);
			
			// Mark job as failed
			await prisma.searchJob.update({ 
				where: { id: job.id },
				data: { 
					status: 'failed',
					errorMessage: error.message,
					completedAt: new Date()
				} 
			});
			
			return NextResponse.json({ 
				success: false, 
				error: error.message,
				job: `${job.service} in ${job.location}`
			}, { status: 500 });
		}

	} catch (error: any) {
		console.error('Process search jobs error:', error);
		return NextResponse.json({ success: false, error: error.message || 'Unexpected error' }, { status: 500 });
	}
}
