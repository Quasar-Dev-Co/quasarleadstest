import { getOpenAIClient } from "@/lib/openai";
import {
  getApiKeysFromCredentials,
  isSerpApiRotationError,
  withApiKeyRotation,
} from "@/lib/api-key-rotation";

type UnknownRecord = Record<string, unknown>;

export type EnrichmentProvider = "serpapi" | "openai";

export type CompanyEnrichmentInput = {
  companyName: string;
  website?: string | null;
  location?: string | null;
};

export type CompanyEnrichmentLead = {
  company_name: string;
  company_email: string | null;
  owner_name: string | null;
  owner_email: string | null;
  manager_name: string | null;
  manager_email: string | null;
  hr_name: string | null;
  hr_email: string | null;
  executive_name: string | null;
  executive_email: string | null;
};

export type CompanyEnrichmentCredentials = {
  serpApiKeys: string[];
  openAiKey: string;
};

export type CompanyEnrichmentResult = {
  lead: CompanyEnrichmentLead;
  provider: EnrichmentProvider;
};

export type CompanyBatchEnrichmentInput = {
  index: number;
  companyName: string;
  website?: string | null;
  location?: string | null;
};

export type CompanyBatchEnrichmentResult = {
  results: Array<{ index: number; lead: CompanyEnrichmentLead; provider: EnrichmentProvider }>;
  failures: Array<{ index: number; companyName: string; error: string }>;
};

const NULL_LIKE = new Set([
  "",
  "null",
  "none",
  "n/a",
  "na",
  "unknown",
  "not available",
  "not found",
  "no email",
]);

function normalizeProvider(value: string | undefined): EnrichmentProvider {
  return value?.trim().toLowerCase() === "openai" ? "openai" : "serpapi";
}

export function resolveCompanyEnrichmentCredentials(credentials: UnknownRecord): CompanyEnrichmentCredentials {
  const serpApiKeys = getApiKeysFromCredentials(credentials, "SERPAPI_KEY", "SERPAPI_ACCOUNTS");
  const openAiKey =
    getApiKeysFromCredentials(credentials, "OPENAI_API_KEY", "OPENAI_ACCOUNTS")[0] || "";

  return {
    serpApiKeys,
    openAiKey,
  };
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return null;
    const asString = String(value).trim();
    if (!asString) return null;
    if (NULL_LIKE.has(asString.toLowerCase())) return null;
    return asString;
  }

  const normalized = value.trim();
  if (!normalized) return null;
  if (NULL_LIKE.has(normalized.toLowerCase())) return null;
  return normalized;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractBalancedJson(text: string): string | null {
  let start = -1;
  let stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (start === -1) start = i;
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.length === 0) continue;
      const top = stack[stack.length - 1];
      const matches = (top === "{" && char === "}") || (top === "[" && char === "]");
      if (!matches) continue;
      stack.pop();
      if (stack.length === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function tryParseJson(text: string): unknown | null {
  const direct = unwrapStringifiedJson(stripCodeFences(text));
  try {
    return JSON.parse(direct);
  } catch {
    // continue
  }

  const blockMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (blockMatch?.[1]) {
    try {
      return JSON.parse(unwrapStringifiedJson(blockMatch[1].trim()));
    } catch {
      // continue
    }
  }

  const extracted = extractBalancedJson(direct);
  if (extracted) {
    const normalizedExtracted = unwrapStringifiedJson(extracted);
    try {
      return JSON.parse(normalizedExtracted);
    } catch {
      const loose = tryParseLooseJson(normalizedExtracted);
      if (loose) return loose;
    }
  }

  return tryParseLooseJson(direct);
}

function unwrapStringifiedJson(input: string): string {
  let candidate = input.trim();
  if (!candidate) return candidate;

  for (let i = 0; i < 2; i++) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        candidate = parsed.trim();
        continue;
      }
    } catch {
      // no-op
    }
    break;
  }

  if (/^\s*\{\\"/.test(candidate) || /^\s*\[\\"/.test(candidate)) {
    candidate = candidate.replace(/\\"/g, '"');
  }

  return candidate;
}

function tryParseLooseJson(input: string): unknown | null {
  let normalized = unwrapStringifiedJson(input);
  if (!normalized) return null;

  normalized = normalized
    .replace(/\\_/g, "_")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, p1) => `: "${String(p1).replace(/"/g, '\\"')}"`);

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function normalizeObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeObjectKeys(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out: UnknownRecord = {};
  for (const [key, val] of Object.entries(value as UnknownRecord)) {
    const normalizedKey = String(key || "").replace(/\\_/g, "_").trim();
    out[normalizedKey] = normalizeObjectKeys(val);
  }

  return out;
}

function pickString(obj: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return null;
}

function normalizeLeadPayload(payload: UnknownRecord, fallbackCompanyName: string): CompanyEnrichmentLead {
  const companyName =
    normalizeNullableString(pickString(payload, ["company_name", "companyName", "company"])) ||
    fallbackCompanyName.trim();

  return {
    company_name: companyName,
    company_email: normalizeNullableString(pickString(payload, ["company_email", "companyEmail", "email"])),
    owner_name: normalizeNullableString(pickString(payload, ["owner_name", "ownerName"])),
    owner_email: normalizeNullableString(pickString(payload, ["owner_email", "ownerEmail"])),
    manager_name: normalizeNullableString(pickString(payload, ["manager_name", "managerName"])),
    manager_email: normalizeNullableString(pickString(payload, ["manager_email", "managerEmail"])),
    hr_name: normalizeNullableString(pickString(payload, ["hr_name", "hrName"])),
    hr_email: normalizeNullableString(pickString(payload, ["hr_email", "hrEmail"])),
    executive_name: normalizeNullableString(pickString(payload, ["executive_name", "executiveName"])),
    executive_email: normalizeNullableString(pickString(payload, ["executive_email", "executiveEmail"])),
  };
}

function parseLeadFromText(text: string, fallbackCompanyName: string): CompanyEnrichmentLead | null {
  const parsed = tryParseJson(text);
  const root = asRecord(normalizeObjectKeys(parsed));
  if (root) {
    const leadObj =
      asRecord(root.lead) ||
      asRecord(root.result) ||
      asRecord(root.data) ||
      asRecord(root.enrichment) ||
      root;

    const expectedKeys = [
      "company_name",
      "companyName",
      "company_email",
      "companyEmail",
      "owner_name",
      "ownerName",
      "manager_name",
      "managerName",
      "hr_name",
      "hrName",
      "executive_name",
      "executiveName",
    ];

    const hasExpected = expectedKeys.some((key) => leadObj[key] !== undefined);
    if (hasExpected) {
      return normalizeLeadPayload(leadObj, fallbackCompanyName);
    }
  }

  return parseLeadFromPlainText(text, fallbackCompanyName);
}

function parseByLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:=-]\\s*([^\\n;|]+)`, "i");
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = normalizeNullableString(match[1]);
      if (value) return value;
    }
  }
  return null;
}

function parseLeadFromPlainText(text: string, fallbackCompanyName: string): CompanyEnrichmentLead | null {
  const clean = stripCodeFences(text).replace(/\\_/g, "_");
  if (!clean.trim()) return null;

  const emailMatches = Array.from(new Set(clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
  const companyEmail = normalizeNullableString(
    parseByLabel(clean, ["company email", "company_email", "business email", "email"]) || emailMatches[0] || null
  );

  const companyName =
    normalizeNullableString(parseByLabel(clean, ["company name", "company_name", "company"])) ||
    fallbackCompanyName.trim();

  const ownerName = normalizeNullableString(parseByLabel(clean, ["owner name", "owner_name", "owner", "founder", "ceo"]));
  const ownerEmail = normalizeNullableString(parseByLabel(clean, ["owner email", "owner_email"]));
  const managerName = normalizeNullableString(parseByLabel(clean, ["manager name", "manager_name", "manager"]));
  const managerEmail = normalizeNullableString(parseByLabel(clean, ["manager email", "manager_email"]));
  const hrName = normalizeNullableString(parseByLabel(clean, ["hr name", "hr_name", "human resources", "hr contact"]));
  const hrEmail = normalizeNullableString(parseByLabel(clean, ["hr email", "hr_email"]));
  const executiveName = normalizeNullableString(parseByLabel(clean, ["executive name", "executive_name", "executive"]));
  const executiveEmail = normalizeNullableString(parseByLabel(clean, ["executive email", "executive_email"]));

  const hasAnySignal = !!(
    companyEmail ||
    ownerName ||
    ownerEmail ||
    managerName ||
    managerEmail ||
    hrName ||
    hrEmail ||
    executiveName ||
    executiveEmail
  );

  if (!hasAnySignal) {
    const hasSchemaMarkers = /company[_\s-]?name|owner[_\s-]?name|manager[_\s-]?name|hr[_\s-]?name|executive[_\s-]?name/i.test(clean);
    if (!hasSchemaMarkers) return null;
  }

  return {
    company_name: companyName,
    company_email: companyEmail,
    owner_name: ownerName,
    owner_email: ownerEmail,
    manager_name: managerName,
    manager_email: managerEmail,
    hr_name: hrName,
    hr_email: hrEmail,
    executive_name: executiveName,
    executive_email: executiveEmail,
  };
}

function buildPrompt(input: CompanyEnrichmentInput): string {
  return [
    "You are a company contact enrichment engine.",
    "Research the company below and return ONLY one valid JSON object.",
    "No markdown. No explanation. No extra keys.",
    "Use null for unknown values.",
    "",
    `<COMPANY>`,
    `Name: ${input.companyName}`,
    `Website: ${input.website || "Unknown"}`,
    `Location: ${input.location || "Unknown"}`,
    `</COMPANY>`,
    "",
    "Return exactly this schema:",
    '{"company_name":"...","company_email":null,"owner_name":null,"owner_email":null,"manager_name":null,"manager_email":null,"hr_name":null,"hr_email":null,"executive_name":null,"executive_email":null}',
  ].join("\n");
}

function buildEmailBackfillPrompt(items: CompanyBatchEnrichmentInput[]): string {
  const companies = items.map((item) => item.companyName.trim()).filter(Boolean);
  const locationVote = new Map<string, { label: string; count: number }>();

  for (const item of items) {
    const label = String(item.location || "").trim();
    if (!label) continue;

    const key = label.toLowerCase();
    const existing = locationVote.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    locationVote.set(key, { label, count: 1 });
  }

  let location = "United States";
  let maxVotes = 0;
  for (const vote of locationVote.values()) {
    if (vote.count > maxVotes) {
      maxVotes = vote.count;
      location = vote.label;
    }
  }

  return [
    `I want the owner, founder, CEO, or main executive name of these ${location}-based companies, along with their personal or direct email addresses.`,
    "Create the results in a clean table format with columns: Company, Main Executive Name, Title, Direct / Business Email.",
    `Companies: (${companies.join(", ")})`,
  ].join("\n");
}

function buildRetryPrompt(input: CompanyEnrichmentInput): string {
  return [
    buildPrompt(input),
    "",
    "IMPORTANT: Previous output was not parseable JSON.",
    "Return one minified JSON object only. No markdown and no surrounding text.",
  ].join("\n");
}

function normalizeCompanyToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractFirstEmail(value: unknown): string | null {
  const text = normalizeNullableString(value);
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ? match[0].trim() : null;
}

function extractFirstEmailFromRow(row: UnknownRecord): string | null {
  for (const value of Object.values(row)) {
    const email = extractFirstEmail(value);
    if (email) return email;
  }
  return null;
}

function buildBatchPrompt(items: CompanyBatchEnrichmentInput[]): string {
  const companies = items.map((item) => item.companyName.trim()).filter(Boolean);
  const locationVote = new Map<string, { label: string; count: number }>();

  for (const item of items) {
    const label = String(item.location || "").trim();
    if (!label) continue;

    const key = label.toLowerCase();
    const existing = locationVote.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    locationVote.set(key, { label, count: 1 });
  }

  let location = "United States";
  let maxVotes = 0;
  for (const vote of locationVote.values()) {
    if (vote.count > maxVotes) {
      maxVotes = vote.count;
      location = vote.label;
    }
  }

  return [
    `I want the owner, founder, CEO, or main executive name of these ${location}-based companies, along with their personal or direct email addresses.`,
    "Create the results in a clean table format with columns: Company, Main Executive Name, Title, Direct / Business Email.",
    `Companies: (${companies.join(", ")})`,
  ].join("\n");
}

function parseBatchRowsFromSerpData(data: UnknownRecord): UnknownRecord[] {
  const textBlocks = data.text_blocks;
  if (!Array.isArray(textBlocks)) return [];

  const rows: UnknownRecord[] = [];

  for (const block of textBlocks) {
    const obj = asRecord(block);
    if (!obj) continue;

    if (Array.isArray(obj.formatted)) {
      for (const formattedRow of obj.formatted) {
        const row = asRecord(normalizeObjectKeys(formattedRow));
        if (row) rows.push(row);
      }
    }

    if (rows.length > 0) continue;

    if (Array.isArray(obj.table) && obj.table.length > 1) {
      const headerRow = Array.isArray(obj.table[0]) ? obj.table[0] : null;
      if (!headerRow) continue;

      const headers = headerRow.map((h) => String(h || "").trim().toLowerCase());
      for (let i = 1; i < obj.table.length; i++) {
        const valueRow = Array.isArray(obj.table[i]) ? obj.table[i] : null;
        if (!valueRow) continue;

        const out: UnknownRecord = {};
        for (let col = 0; col < headers.length; col++) {
          out[headers[col]] = valueRow[col];
        }
        rows.push(normalizeObjectKeys(out) as UnknownRecord);
      }
    }
  }

  return rows;
}

function rowToLead(row: UnknownRecord, fallbackCompanyName: string): CompanyEnrichmentLead | null {
  const companyName =
    normalizeNullableString(
      pickString(row, [
        "company_name",
        "company",
        "company name",
      ])
    ) || fallbackCompanyName;

  const executiveName = normalizeNullableString(
    pickString(row, [
      "executive_name",
      "executive name",
      "main executive name",
      "main_executive_name",
      "chief executive / founder",
      "chief_executive_/_founder",
      "owner_name",
      "ownerName",
      "executive",
      "owner",
      "founder",
      "ceo"
    ]) 
  );

  const titleRole = normalizeNullableString(
    pickString(row, [
      "title_role",
      "title",
      "role",
      "title / role",
      "executive title",
      "executive_title"
    ])
  );

  const directEmail =
    extractFirstEmail(
      pickString(row, [
        "direct_/_business_email",
        "direct / business email",
        "direct_personal_corporate_email_address",
        "direct_personal_email",
        "primary/direct email address",
        "primary / direct email address",
        "primary direct email address",
        "direct email address",
        "primary_email",
        "primary email",
        "email",
        "owner_email",
        "executive_email",
        "company_email",
        "direct/personal corporate email address",
      ])
    ) || extractFirstEmailFromRow(row);

  if (!companyName.trim()) return null;

  return {
    company_name: companyName,
    company_email: directEmail,
    owner_name: executiveName,
    owner_email: directEmail,
    manager_name: null,
    manager_email: null,
    hr_name: null,
    hr_email: null,
    executive_name: executiveName,
    executive_email: directEmail,
  };
}

function leadHasDirectEmail(lead: CompanyEnrichmentLead | null | undefined): boolean {
  if (!lead) return false;

  const candidates = [
    lead.company_email,
    lead.owner_email,
    lead.executive_email,
    lead.manager_email,
    lead.hr_email,
  ];

  return candidates.some((value) => !!extractFirstEmail(value));
}

function mergeLeadWithFallback(
  batchLead: CompanyEnrichmentLead,
  fallbackLead: CompanyEnrichmentLead,
  companyName: string
): CompanyEnrichmentLead {
  return {
    company_name: companyName,
    company_email: batchLead.company_email || fallbackLead.company_email,
    owner_name: batchLead.owner_name || fallbackLead.owner_name,
    owner_email: batchLead.owner_email || fallbackLead.owner_email,
    manager_name: batchLead.manager_name || fallbackLead.manager_name,
    manager_email: batchLead.manager_email || fallbackLead.manager_email,
    hr_name: batchLead.hr_name || fallbackLead.hr_name,
    hr_email: batchLead.hr_email || fallbackLead.hr_email,
    executive_name: batchLead.executive_name || fallbackLead.executive_name,
    executive_email: batchLead.executive_email || fallbackLead.executive_email,
  };
}

async function requestSerpAiModeData(prompt: string, serpApiKeys: string[]): Promise<UnknownRecord> {
  const rotated = await withApiKeyRotation(
    serpApiKeys,
    async (apiKey) => {
      const params = new URLSearchParams({
        engine: "google_ai_mode",
        q: prompt,
        api_key: apiKey,
        hl: "en",
        gl: "us",
      });

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as UnknownRecord;

      if (!response.ok) {
        throw {
          status: response.status,
          data,
          message: `SerpApi AI Mode request failed (${response.status})`,
        };
      }

      if (typeof data.error === "string" && data.error.trim()) {
        throw {
          status: 400,
          data,
          message: data.error,
        };
      }

      return data;
    },
    isSerpApiRotationError,
    "SERPAPI"
  );

  return rotated.value as UnknownRecord;
}

function extractSerpAiText(data: UnknownRecord): string {
  const chunks: string[] = [];

  const markdown = data.reconstructed_markdown;
  if (typeof markdown === "string" && markdown.trim()) {
    chunks.push(markdown.trim());
  }

  const textBlocks = data.text_blocks;
  if (Array.isArray(textBlocks)) {
    for (const block of textBlocks) {
      if (typeof block === "string") {
        const value = block.trim();
        if (value) chunks.push(value);
        continue;
      }

      const obj = asRecord(block);
      if (!obj) continue;

      const candidates = [obj.text, obj.snippet, obj.markdown, obj.content];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          chunks.push(candidate.trim());
          break;
        }
      }
    }
  }

  const answer = data.answer;
  if (typeof answer === "string" && answer.trim()) {
    chunks.push(answer.trim());
  }

  if (chunks.length === 0) {
    chunks.push(JSON.stringify(data));
  }

  return chunks.join("\n");
}

async function requestSerpAiMode(prompt: string, serpApiKeys: string[]): Promise<string> {
  const rotated = await withApiKeyRotation(
    serpApiKeys,
    async (apiKey) => {
      const params = new URLSearchParams({
        engine: "google_ai_mode",
        q: prompt,
        api_key: apiKey,
        hl: "en",
      });

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as UnknownRecord;

      if (!response.ok) {
        throw {
          status: response.status,
          data,
          message: `SerpApi AI Mode request failed (${response.status})`,
        };
      }

      if (typeof data.error === "string" && data.error.trim()) {
        throw {
          status: 400,
          data,
          message: data.error,
        };
      }

      return data;
    },
    isSerpApiRotationError,
    "SERPAPI"
  );

  const payload = rotated.value as UnknownRecord;
  return extractSerpAiText(payload);
}

async function requestOpenAi(prompt: string, openAiKey: string): Promise<string> {
  const openai = getOpenAIClient(openAiKey);
  const response = await (openai as any).responses.create({
    model: "gpt-5-mini",
    tools: [{ type: "web_search_preview" }],
    input: prompt,
  } as any);

  const outputText = (response as any)?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  return JSON.stringify(response);
}

async function enrichWithProvider(
  provider: EnrichmentProvider,
  input: CompanyEnrichmentInput,
  creds: CompanyEnrichmentCredentials
): Promise<CompanyEnrichmentLead> {
  const prompt = buildPrompt(input);
  const retryPrompt = buildRetryPrompt(input);

  let text = "";
  if (provider === "serpapi") {
    text = await requestSerpAiMode(prompt, creds.serpApiKeys);
  } else {
    text = await requestOpenAi(prompt, creds.openAiKey);
  }

  let parsed = parseLeadFromText(text, input.companyName);
  if (parsed) return parsed;

  if (provider === "serpapi") {
    text = await requestSerpAiMode(retryPrompt, creds.serpApiKeys);
  } else {
    text = await requestOpenAi(retryPrompt, creds.openAiKey);
  }

  parsed = parseLeadFromText(text, input.companyName);
  if (parsed) return parsed;

  const preview = text.replace(/\s+/g, " ").slice(0, 600);
  throw new Error(`${provider.toUpperCase()} returned an unparseable enrichment payload. Preview: ${preview}`);
}

function getProviderOrder(
  creds: CompanyEnrichmentCredentials,
  preferredProvider: EnrichmentProvider,
  allowFallback: boolean
): EnrichmentProvider[] {
  if (!allowFallback) {
    if (preferredProvider === "serpapi") {
      return creds.serpApiKeys.length > 0 ? ["serpapi"] : [];
    }

    return creds.openAiKey ? ["openai"] : [];
  }

  const preferredFirst: EnrichmentProvider[] =
    preferredProvider === "openai" ? ["openai", "serpapi"] : ["serpapi", "openai"];

  const available = preferredFirst.filter((provider) => {
    if (provider === "serpapi") return creds.serpApiKeys.length > 0;
    return !!creds.openAiKey;
  });

  return available;
}

export async function enrichCompanyProfilesBatch(
  items: CompanyBatchEnrichmentInput[],
  credentials: UnknownRecord,
  options?: {
    preferredProvider?: EnrichmentProvider;
    allowFallback?: boolean;
  }
): Promise<CompanyBatchEnrichmentResult> {
  const normalizedItems = items
    .map((item, idx) => ({
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : idx,
      companyName: String(item.companyName || "").trim(),
      website: item.website || null,
      location: item.location || null,
    }))
    .filter((item) => !!item.companyName)
    .slice(0, 10);

  if (normalizedItems.length === 0) {
    return { results: [], failures: [] };
  }

  const creds = resolveCompanyEnrichmentCredentials(credentials);
  const preferredProvider = options?.preferredProvider || normalizeProvider(process.env.COMPANY_ENRICHMENT_PROVIDER);
  const allowFallback =
    options?.allowFallback ?? (String(process.env.COMPANY_ENRICHMENT_ALLOW_FALLBACK || "false").toLowerCase() === "true");
  const providers = getProviderOrder(creds, preferredProvider, allowFallback);

  if (providers.length === 0) {
    const missingProvider = preferredProvider === "serpapi" ? "SERPAPI_KEY" : "OPENAI_API_KEY";
    throw new Error(`Missing enrichment credentials. Add ${missingProvider} in Account Settings.`);
  }

  const failuresByIndex = new Map<number, { index: number; companyName: string; error: string }>();

  for (const provider of providers) {
    try {
      if (provider === "serpapi") {
        const prompt = buildBatchPrompt(normalizedItems);
        console.log(
          `[ENRICHMENT][BATCH][SERPAPI] Processing ${normalizedItems.length} companies: ${normalizedItems
            .map((item) => item.companyName)
            .join(" | ")}`
        );
        const payload = await requestSerpAiModeData(prompt, creds.serpApiKeys);
        const parsedRows = parseBatchRowsFromSerpData(payload);

        const rowLeads = parsedRows
          .map((row) => rowToLead(row, ""))
          .filter((lead): lead is CompanyEnrichmentLead => !!lead && !!lead.company_name);

        const assignedRows = new Map<number, CompanyEnrichmentLead>();
        const usedRowIndexes = new Set<number>();

        for (const item of normalizedItems) {
          const itemToken = normalizeCompanyToken(item.companyName);
          let matchIndex = -1;

          for (let i = 0; i < rowLeads.length; i++) {
            if (usedRowIndexes.has(i)) continue;
            const rowToken = normalizeCompanyToken(rowLeads[i].company_name || "");
            if (!rowToken || !itemToken) continue;

            if (rowToken === itemToken || rowToken.includes(itemToken) || itemToken.includes(rowToken)) {
              matchIndex = i;
              break;
            }
          }

          if (matchIndex >= 0) {
            usedRowIndexes.add(matchIndex);
            assignedRows.set(item.index, {
              ...rowLeads[matchIndex],
              company_name: item.companyName,
            });
          }
        }

        const results: Array<{ index: number; lead: CompanyEnrichmentLead; provider: EnrichmentProvider }> = [];
        const failures: Array<{ index: number; companyName: string; error: string }> = [];
        const finalLeadsByIndex = new Map<number, CompanyEnrichmentLead>();
        const missingEmailItems: typeof normalizedItems = [];

        for (const item of normalizedItems) {
          const matched = assignedRows.get(item.index);
          if (!matched) {
            const message = `No batch row matched for company: ${item.companyName}`;
            failures.push({ index: item.index, companyName: item.companyName, error: message });
            continue;
          }

          finalLeadsByIndex.set(item.index, matched);
          if (!leadHasDirectEmail(matched)) {
            missingEmailItems.push(item);
          }
        }

        let emailBackfillRecovered = 0;
        let emailBackfillBatchCalls = 0;

        const runGroupedBackfill = async (
          sourceItems: typeof normalizedItems,
          promptBuilder: (items: CompanyBatchEnrichmentInput[]) => string
        ): Promise<void> => {
          for (let i = 0; i < sourceItems.length; i += 3) {
            const chunk = sourceItems.slice(i, i + 3);
            if (chunk.length === 0) continue;

            try {
              emailBackfillBatchCalls += 1;
              const fallbackPrompt = promptBuilder(chunk);
              const fallbackPayload = await requestSerpAiModeData(fallbackPrompt, creds.serpApiKeys);
              const fallbackRows = parseBatchRowsFromSerpData(fallbackPayload)
                .map((row) => rowToLead(row, ""))
                .filter((lead): lead is CompanyEnrichmentLead => !!lead && !!lead.company_name);

              const usedFallbackRowIndexes = new Set<number>();

              for (const item of chunk) {
                const currentLead = finalLeadsByIndex.get(item.index);
                if (!currentLead) continue;

                const itemToken = normalizeCompanyToken(item.companyName);
                let matchIndex = -1;

                for (let rowIdx = 0; rowIdx < fallbackRows.length; rowIdx++) {
                  if (usedFallbackRowIndexes.has(rowIdx)) continue;
                  const rowToken = normalizeCompanyToken(fallbackRows[rowIdx].company_name || "");
                  if (!rowToken || !itemToken) continue;

                  if (rowToken === itemToken || rowToken.includes(itemToken) || itemToken.includes(rowToken)) {
                    matchIndex = rowIdx;
                    break;
                  }
                }

                if (matchIndex < 0) continue;
                usedFallbackRowIndexes.add(matchIndex);

                const fallbackLead = fallbackRows[matchIndex];
                if (!leadHasDirectEmail(fallbackLead)) continue;

                finalLeadsByIndex.set(
                  item.index,
                  mergeLeadWithFallback(currentLead, fallbackLead, item.companyName)
                );
                emailBackfillRecovered += 1;
              }
            } catch {
              // Keep original batch leads when grouped fallback fails.
            }
          }
        };

        await runGroupedBackfill(missingEmailItems, buildBatchPrompt);

        const unresolvedAfterFirstPass = missingEmailItems.filter((item) => {
          const lead = finalLeadsByIndex.get(item.index);
          return !!lead && !leadHasDirectEmail(lead);
        });

        if (unresolvedAfterFirstPass.length > 0) {
          await runGroupedBackfill(unresolvedAfterFirstPass, buildEmailBackfillPrompt);
        }

        for (const item of normalizedItems) {
          const lead = finalLeadsByIndex.get(item.index);
          if (lead) {
            results.push({ index: item.index, lead, provider });
          }
        }

        if (emailBackfillRecovered > 0) {
          console.log(
            `[ENRICHMENT][BATCH][SERPAPI] Recovered direct emails for ${emailBackfillRecovered} compan${emailBackfillRecovered === 1 ? "y" : "ies"} via ${emailBackfillBatchCalls} grouped fallback call${emailBackfillBatchCalls === 1 ? "" : "s"} (chunk size: 3, max 2 rounds)`
          );
        }

        return { results, failures };
      }

      // OpenAI fallback path (if explicitly enabled) still runs one-by-one.
      const fallbackResults: Array<{ index: number; lead: CompanyEnrichmentLead; provider: EnrichmentProvider }> = [];
      const fallbackFailures: Array<{ index: number; companyName: string; error: string }> = [];

      for (const item of normalizedItems) {
        try {
          const lead = await enrichWithProvider(provider, {
            companyName: item.companyName,
            website: item.website || null,
            location: item.location || null,
          }, creds);

          fallbackResults.push({ index: item.index, lead, provider });
        } catch (error) {
          fallbackFailures.push({
            index: item.index,
            companyName: item.companyName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { results: fallbackResults, failures: fallbackFailures };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const item of normalizedItems) {
        failuresByIndex.set(item.index, {
          index: item.index,
          companyName: item.companyName,
          error: `${provider}: ${message}`,
        });
      }
      // Try next provider only if available.
    }
  }

  return {
    results: [],
    failures: Array.from(failuresByIndex.values()),
  };
}

export async function enrichCompanyProfile(
  input: CompanyEnrichmentInput,
  credentials: UnknownRecord,
  options?: {
    preferredProvider?: EnrichmentProvider;
    allowFallback?: boolean;
  }
): Promise<CompanyEnrichmentResult> {
  const creds = resolveCompanyEnrichmentCredentials(credentials);

  const preferredProvider = options?.preferredProvider || normalizeProvider(process.env.COMPANY_ENRICHMENT_PROVIDER);
  const allowFallback =
    options?.allowFallback ?? (String(process.env.COMPANY_ENRICHMENT_ALLOW_FALLBACK || "false").toLowerCase() === "true");

  const providers = getProviderOrder(creds, preferredProvider, allowFallback);
  if (providers.length === 0) {
    const missingProvider = preferredProvider === "serpapi" ? "SERPAPI_KEY" : "OPENAI_API_KEY";
    throw new Error(`Missing enrichment credentials. Add ${missingProvider} in Account Settings.`);
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const lead = await enrichWithProvider(provider, input, creds);
      return { lead, provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`Company enrichment failed. ${errors.join(" | ")}`);
}
