/**
 * Bot / crawler / scanner detection for email open tracking.
 *
 * Email tracking pixels are loaded by email clients when a recipient opens an
 * email. However, many bots also load these pixels:
 *   - Search engine crawlers (Googlebot, bingbot, etc.)
 *   - Link previewers (Apple, Slack, Discord, Skype, LinkedIn)
 *   - Security scanners (Proofpoint, Mimecast, Barracuda, VirusTotal)
 *   - Headless browsers / automation tools (Puppeteer, Selenium, cURL)
 *   - Email pre-fetchers (Gmail Image Proxy, Outlook Safe Links)
 *
 * This module identifies these non-human requests so that email open tracking
 * only counts REAL email client opens, not bot activity.
 */

// Known bot/crawler/scanner User-Agent patterns (case-insensitive substring match)
const BOT_PATTERNS: string[] = [
  // Search engine crawlers
  'googlebot',
  'bingbot',
  'slurp', // Yahoo
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'ia_archiver', // Alexa

  // Social / link preview crawlers
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'telegrambot',
  'whatsapp',
  'slack',
  'discord',
  'skypeuripreview',
  'skype',
  'pinterest',
  'redditbot',

  // SEO / marketing crawlers
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'rogerbot', // Moz
  'seznambot',
  'gosquared',
  'uptime',
  'site24x7',
  'pingdom',
  'newrelic',
  'datadog',
  'statuscake',
  'nodeping',
  'hetrixtools',

  // Security scanners / email filters
  'proofpoint',
  'mimecast',
  'barracuda',
  'virustotal',
  'sophos',
  'fortinet',
  'kaspersky',
  'avast',
  'avg',
  'norton',
  'mcafee',
  'eset',
  'trendmicro',
  'outlook safelinks',
  'outlook-safelinks',
  'outlooksafelinks',
  'googleimageproxy',
  'google-safe-browsing',
  'googleweblight',

  // Headless browsers / automation
  'headlesschrome',
  'puppeteer',
  'selenium',
  'phantomjs',
  'webdriver',
  'cypress',
  'playwright',
  'nightmare',
  'electron',

  // HTTP libraries / CLI tools
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'node-fetch',
  'axios',
  'go-http-client',
  'java/',
  'okhttp',
  'httpclient',
  'httpx',
  'aiohttp',
  'got/',
  'rest-client',
  'http-kit',
  'ruby',
  'php/',
  'scraper',
  'crawler',
  'spider',
  'bot/',
  'bot;', // "bot;" appears in many bot UAs

  // Generic crawler/spider/scan keywords
  'crawl',
  'spider',
  'scan',
  'fetch',
  'preview',
  'validator',
  'checker',
  'monitor',
  'healthcheck',
  'health-check',
  'kube-probe',
  'prometheus',
  'grafana',

  // Email pre-fetchers / image proxies
  'imageproxy',
  'proxy',
  'pre-fetch',
  'prefetch',
];

// Suspicious User-Agent characteristics
const SUSPICIOUS_PATTERNS: RegExp[] = [
  // Empty or whitespace-only UA
  /^\s*$/,
  // Very short UA (real email clients send long, detailed UAs)
  /^.{0,15}$/,
  // UA that is just a URL
  /^https?:\/\//i,
];

/**
 * Returns true if the User-Agent string matches a known bot/crawler pattern
 * or looks suspicious (empty, too short, etc.).
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // No UA at all is suspicious — real email clients always send one

  const ua = userAgent.toLowerCase().trim();

  // Check suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(ua)) return true;
  }

  // Check known bot patterns (substring match)
  for (const botPattern of BOT_PATTERNS) {
    if (ua.includes(botPattern)) return true;
  }

  return false;
}

/**
 * Returns true if the request appears to be from a bot/crawler/scanner
 * rather than a real email client or human user.
 *
 * Checks both User-Agent and IP (some known scanner IPs/datacenter ranges
 * could be added here in the future).
 */
export function isBotRequest(userAgent: string | null | undefined, ipAddress?: string | null): boolean {
  // Primary signal: User-Agent
  if (isBotUserAgent(userAgent)) return true;

  // Future: could add IP-based detection for known datacenter/scanner ranges
  // For now, UA-based detection is the primary filter
  if (ipAddress) {
    // Link-local / loopback requests are almost never real email client opens
    if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('169.254.')) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a short label identifying the bot type (for debugging/logging).
 */
export function identifyBot(userAgent: string | null | undefined): string {
  if (!userAgent) return 'empty-ua';
  const ua = userAgent.toLowerCase();

  if (ua.includes('googlebot')) return 'googlebot';
  if (ua.includes('bingbot')) return 'bingbot';
  if (ua.includes('googleimageproxy') || ua.includes('google-image')) return 'google-image-proxy';
  if (ua.includes('facebookexternalhit')) return 'facebook';
  if (ua.includes('twitterbot')) return 'twitter';
  if (ua.includes('linkedinbot')) return 'linkedin';
  if (ua.includes('outlook') && ua.includes('safelinks')) return 'outlook-safelinks';
  if (ua.includes('proofpoint')) return 'proofpoint';
  if (ua.includes('mimecast')) return 'mimecast';
  if (ua.includes('barracuda')) return 'barracuda';
  if (ua.includes('curl')) return 'curl';
  if (ua.includes('wget')) return 'wget';
  if (ua.includes('python')) return 'python';
  if (ua.includes('headlesschrome') || ua.includes('puppeteer')) return 'headless-browser';
  if (ua.includes('ahrefsbot')) return 'ahrefs';
  if (ua.includes('semrushbot')) return 'semrush';
  if (ua.includes('crawl')) return 'crawler';
  if (ua.includes('spider')) return 'spider';
  if (ua.includes('bot')) return 'bot';
  if (/^\s*$/.test(ua) || ua.length < 16) return 'suspicious-ua';
  return 'unknown-bot';
}
