import { getApiKeysFromCredentials } from "@/lib/api-key-rotation";
import {
  CompanyBatchEnrichmentInput,
  CompanyBatchEnrichmentResult,
  CompanyEnrichmentLead,
  EnrichmentProvider,
} from "@/lib/companyEnrichment";

type UnknownRecord = Record<string, unknown>;

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_MAX_OUTPUT_TOKENS = 65536;
const GEMINI_THINKING_LEVEL = "medium";

// Hard cap on companies per Gemini interaction. Mirrors the cron batch size.
export const GEMINI_ENRICHMENT_GROUP_SIZE = 10;

export type GeminiEnrichmentCredentials = {
  geminiApiKey: string;
};

export function resolveGeminiEnrichmentCredentials(credentials: UnknownRecord): GeminiEnrichmentCredentials {
  const geminiKeys = getApiKeysFromCredentials(credentials, "GEMINI_API_KEY", "GEMINI_ACCOUNTS");
  const envKey = String(process.env.GEMINI_API_KEY || "").trim();

  const geminiApiKey = geminiKeys[0] || envKey || "";

  return { geminiApiKey };
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return null;
    const asString = String(value).trim();
    if (!asString) return null;
    return asString;
  }

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function pickString(obj: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return null;
}

function extractErrorMessage(data: unknown): string | null {
  const root = asRecord(data);
  if (!root) return null;

  // Try top-level "message" string.
  const directMessage = normalizeNullableString(root.message);
  if (directMessage) return directMessage;

  // Try "error" as a string.
  const errorValue = root.error;
  if (typeof errorValue === "string") return normalizeNullableString(errorValue);

  // Try nested error.message (Google API format: { error: { message: "..." } }).
  const errorObj = asRecord(errorValue);
  if (errorObj) {
    const nestedMessage = normalizeNullableString(pickString(errorObj, ["message", "status", "code"]));
    if (nestedMessage) return nestedMessage;
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

function normalizeCompanyToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
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
  const direct = stripCodeFences(text);
  try {
    return JSON.parse(direct);
  } catch {
    // continue
  }

  const blockMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (blockMatch?.[1]) {
    try {
      return JSON.parse(blockMatch[1].trim());
    } catch {
      // continue
    }
  }

  const extracted = extractBalancedJson(direct);
  if (extracted) {
    try {
      return JSON.parse(extracted);
    } catch {
      // continue
    }
  }

  return null;
}

function buildBatchPrompt(items: CompanyBatchEnrichmentInput[]): string {
  const companies = items.map((item, idx) => {
    const parts = [`${idx + 1}. Company: ${item.companyName.trim()}`];
    if (item.website) parts.push(`Website: ${String(item.website).trim()}`);
    if (item.location) parts.push(`Location: ${String(item.location).trim()}`);
    return parts.join(" | ");
  });

  return [
    "You are a company contact enrichment engine.",
    "Use Google Search to research each company below and find verified contact information.",
    "Return ONLY one valid JSON object with a single `companies` array.",
    "Each array entry must use the provided `index` (1-based) so results can be matched back.",
    "Use null for any value you cannot verify from search results. Do not invent emails.",
    "No markdown, no explanation, no surrounding text.",
    "",
    "Companies:",
    companies.join("\n"),
    "",
    "Return exactly this schema:",
    '{"companies":[{"index":1,"company_name":"...","company_email":null,"owner_name":null,"owner_email":null,"manager_name":null,"manager_email":null,"hr_name":null,"hr_email":null,"executive_name":null,"executive_email":null}]}',
  ].join("\n");
}

function extractOutputText(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "";

  // Interactions API may return `output_text` directly.
  const direct = normalizeNullableString(root.output_text);
  if (direct) return direct;

  // Otherwise scan steps/candidates for text content.
  const candidates: unknown[] = [];

  const steps = root.steps;
  if (Array.isArray(steps)) candidates.push(...steps);

  const candidatesField = root.candidates;
  if (Array.isArray(candidatesField)) candidates.push(...candidatesField);

  for (const candidate of candidates) {
    const obj = asRecord(candidate);
    if (!obj) continue;

    const text = normalizeNullableString(obj.text) || normalizeNullableString(obj.output_text);
    if (text) return text;

    const content = obj.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const partObj = asRecord(part);
        if (!partObj) continue;
        const partText = normalizeNullableString(partObj.text);
        if (partText) return partText;
      }
    }
  }

  return "";
}

function parseBatchLeads(text: string, items: CompanyBatchEnrichmentInput[]): Map<number, CompanyEnrichmentLead> {
  const parsed = tryParseJson(text);
  const root = asRecord(parsed);

  const rows: UnknownRecord[] = [];
  if (root) {
    const companiesField = root.companies;
    if (Array.isArray(companiesField)) {
      for (const company of companiesField) {
        const row = asRecord(company);
        if (row) rows.push(row);
      }
    } else {
      rows.push(root);
    }
  }

  const assigned = new Map<number, CompanyEnrichmentLead>();
  const usedRowIndexes = new Set<number>();

  for (const item of items) {
    const itemToken = normalizeCompanyToken(item.companyName);
    let matchIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      if (usedRowIndexes.has(i)) continue;
      const row = rows[i];

      const indexValue = Number(pickString(row, ["index"]));
      if (Number.isFinite(indexValue) && indexValue === item.index + 1) {
        matchIndex = i;
        break;
      }

      const rowToken = normalizeCompanyToken(String(pickString(row, ["company_name", "companyName", "company"]) || ""));
      if (!itemToken || !rowToken) continue;

      if (rowToken === itemToken || rowToken.includes(itemToken) || itemToken.includes(rowToken)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex >= 0) {
      usedRowIndexes.add(matchIndex);
      assigned.set(item.index, normalizeLeadPayload(rows[matchIndex], item.companyName));
    }
  }

  return assigned;
}

async function requestGeminiInteraction(prompt: string, apiKey: string): Promise<string> {
  const body = {
    model: GEMINI_MODEL,
    input: prompt,
    tools: [{ type: "google_search" }],
    generation_config: {
      max_output_tokens: GEMINI_MAX_OUTPUT_TOKENS,
      thinking_level: GEMINI_THINKING_LEVEL,
    },
  };

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as UnknownRecord;

  if (!response.ok) {
    const message = extractErrorMessage(data) || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }

  return extractOutputText(data);
}

/**
 * Enrich up to 10 companies in a single Gemini Interactions API call using
 * Google Search grounding. Returns matched leads and per-company failures.
 * No SerpAPI fallback is used; unresolved companies are reported as failures.
 */
export async function enrichCompanyProfilesWithGemini(
  items: CompanyBatchEnrichmentInput[],
  credentials: UnknownRecord
): Promise<CompanyBatchEnrichmentResult> {
  const normalizedItems = items
    .map((item, idx) => ({
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : idx,
      companyName: String(item.companyName || "").trim(),
      website: item.website || null,
      location: item.location || null,
    }))
    .filter((item) => !!item.companyName)
    .slice(0, GEMINI_ENRICHMENT_GROUP_SIZE);

  if (normalizedItems.length === 0) {
    return { results: [], failures: [] };
  }

  const { geminiApiKey } = resolveGeminiEnrichmentCredentials(credentials);
  if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it in Account Settings > Credentials.");
  }

  const prompt = buildBatchPrompt(normalizedItems);
  const provider: EnrichmentProvider = "gemini";

  try {
    const text = await requestGeminiInteraction(prompt, geminiApiKey);
    const assigned = parseBatchLeads(text, normalizedItems);

    const results: CompanyBatchEnrichmentResult["results"] = [];
    const failures: CompanyBatchEnrichmentResult["failures"] = [];

    for (const item of normalizedItems) {
      const lead = assigned.get(item.index);
      if (lead) {
        results.push({ index: item.index, lead, provider });
      } else {
        failures.push({
          index: item.index,
          companyName: item.companyName,
          error: "Gemini returned no parseable result for this company",
        });
      }
    }

    return { results, failures };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      results: [],
      failures: normalizedItems.map((item) => ({
        index: item.index,
        companyName: item.companyName,
        error: message,
      })),
    };
  }
}
