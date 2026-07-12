import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { services, locations, userId } = body || {};

		if (!userId) {
			return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 401 });
		}
		if (!services || !locations) {
			return NextResponse.json({ success: false, error: 'services and locations are required' }, { status: 400 });
		}

		// Verify user exists to prevent foreign key constraint error
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, credentials: true }
		});
		if (!user) {
			return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
		}

		const rawCreds = (user.credentials as Record<string, any>) || {};

		const resolveFirstApiKey = (singleKeyName: string, accountListName: string) => {
			const single = String(rawCreds[singleKeyName] || '').trim();
			if (single) return single;

			const accountList = rawCreds[accountListName];
			if (!Array.isArray(accountList)) return '';

			for (const account of accountList) {
				if (typeof account === 'string' && account.trim()) return account.trim();
				if (typeof account?.apiKey === 'string' && account.apiKey.trim()) return account.apiKey.trim();
				if (typeof account?.key === 'string' && account.key.trim()) return account.key.trim();
				if (typeof account?.value === 'string' && account.value.trim()) return account.value.trim();
				if (typeof account?.SERPAPI_KEY === 'string' && account.SERPAPI_KEY.trim()) return account.SERPAPI_KEY.trim();
				if (typeof account?.OPENAI_API_KEY === 'string' && account.OPENAI_API_KEY.trim()) return account.OPENAI_API_KEY.trim();
			}

			return '';
		};

		const resolveFirstSmtp = () => {
			const smtpAccounts = rawCreds.SMTP_ACCOUNTS;
			if (!Array.isArray(smtpAccounts)) return null;

			for (const account of smtpAccounts) {
				const host = String(account?.SMTP_HOST ?? account?.host ?? '').trim();
				const port = String(account?.SMTP_PORT ?? account?.port ?? '').trim();
				const user = String(account?.SMTP_USER ?? account?.user ?? '').trim();
				const password = String(account?.SMTP_PASSWORD ?? account?.password ?? '').trim();
				if (host || port || user || password) {
					return { host, port, user, password };
				}
			}

			return null;
		};

		const firstSmtp = resolveFirstSmtp();
		const creds: Record<string, any> = {
			...rawCreds,
			SERPAPI_KEY: resolveFirstApiKey('SERPAPI_KEY', 'SERPAPI_ACCOUNTS'),
			OPENAI_API_KEY: resolveFirstApiKey('OPENAI_API_KEY', 'OPENAI_ACCOUNTS'),
			SMTP_HOST: String(rawCreds.SMTP_HOST || firstSmtp?.host || '').trim(),
			SMTP_PORT: String(rawCreds.SMTP_PORT || firstSmtp?.port || '').trim(),
			SMTP_USER: String(rawCreds.SMTP_USER || firstSmtp?.user || '').trim(),
			SMTP_PASSWORD: String(rawCreds.SMTP_PASSWORD || firstSmtp?.password || '').trim(),
		};
		const requiredByGroup = [
			{ group: 'SERPAPI', keys: ['SERPAPI_KEY'] },
			{ group: 'OpenAI', keys: ['OPENAI_API_KEY'] },
			{ group: 'SMTP', keys: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] },
			{ group: 'IMAP', keys: ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASSWORD'] },
		];

		for (const rule of requiredByGroup) {
			const missing = rule.keys.filter((key) => {
				const value = creds[key];
				return !value || String(value).trim() === '';
			});

			if (missing.length > 0) {
				console.error(`❌ Search job creation blocked for user ${userId}. Missing ${rule.group}: ${missing.join(', ')}`);
				return NextResponse.json({
					success: false,
					error: `Missing ${rule.group} credentials. Please fill them in Account Settings > Credentials.`,
					missingCredentials: missing,
					missingGroup: rule.group
				}, { status: 400 });
			}
		}

		// Parse services and locations
		const servicesList: string[] = typeof services === 'string'
			? services.split(',').map(s => s.trim()).filter(Boolean)
			: Array.isArray(services) ? services : [services];

		const locationsList: string[] = typeof locations === 'string'
			? locations.split(',').map(l => l.trim()).filter(Boolean)
			: Array.isArray(locations) ? locations : [locations];

		// Create job for each service×location combination
		const jobs = [];
		for (const service of servicesList) {
			for (const location of locationsList) {
				jobs.push({
					service: service.trim(),
					location: location.trim(),
					userId,
					status: 'pending'
				});
			}
		}

		// Insert all jobs
		const insertedJobs = await prisma.searchJob.createMany({
			data: jobs
		});
		const totalCombinations = servicesList.length * locationsList.length;

		return NextResponse.json({
			success: true,
			jobsCreated: insertedJobs.count,
			totalCombinations,
			estimatedTime: `${totalCombinations * 5} minutes`,
			message: `Created ${totalCombinations} search jobs. Each will process in ~5 minutes via cron.`
		});
	} catch (error: any) {
		console.error('Search job creation error:', error);

		if (error.message?.includes('Can\'t reach database server') || error.code === 'P1001') {
			return NextResponse.json({
				success: false,
				error: 'Database connection failed. Please ensure your IP is whitelisted in AWS RDS and ?sslmode=require is in your .env'
			}, { status: 503 });
		}

		return NextResponse.json({ success: false, error: error.message || 'Unexpected error' }, { status: 500 });
	}
}


