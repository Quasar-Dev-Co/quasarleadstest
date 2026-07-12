type UnknownRecord = Record<string, any>;

function compactUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function getApiKeysFromCredentials(
  credentials: UnknownRecord | null | undefined,
  primaryKeyName: string,
  accountsKeyName: string
): string[] {
  const creds = credentials || {};
  const keys: string[] = [];

  const primary = String(creds[primaryKeyName] || '').trim();
  if (primary) keys.push(primary);

  const accounts = creds[accountsKeyName];
  if (Array.isArray(accounts)) {
    for (const account of accounts) {
      if (typeof account === 'string') {
        keys.push(account);
        continue;
      }

      if (!account || typeof account !== 'object') continue;

      const candidates = [
        account[primaryKeyName],
        account.apiKey,
        account.key,
        account.value,
        account.SERPAPI_KEY,
        account.OPENAI_API_KEY,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          keys.push(candidate);
          break;
        }
      }
    }
  }

  return compactUnique(keys);
}

export function appendEnvKey(keys: string[], envKey?: string): string[] {
  if (!envKey || !envKey.trim()) return compactUnique(keys);
  return compactUnique([...keys, envKey.trim()]);
}

function errorToText(error: unknown): string {
  if (!error) return '';

  if (typeof error === 'string') return error;

  const err = error as UnknownRecord;
  const parts: string[] = [];

  if (typeof err.message === 'string') parts.push(err.message);
  if (typeof err.code === 'string') parts.push(err.code);
  if (typeof err.status === 'number') parts.push(String(err.status));

  if (err.data && typeof err.data === 'object') {
    if (typeof err.data.error === 'string') parts.push(err.data.error);
    if (typeof err.data.message === 'string') parts.push(err.data.message);
    if (err.data.error && typeof err.data.error === 'object') {
      if (typeof err.data.error.code === 'string') parts.push(err.data.error.code);
      if (typeof err.data.error.message === 'string') parts.push(err.data.error.message);
      if (typeof err.data.error.type === 'string') parts.push(err.data.error.type);
    }
  }

  if (err.error && typeof err.error === 'object') {
    if (typeof err.error.code === 'string') parts.push(err.error.code);
    if (typeof err.error.message === 'string') parts.push(err.error.message);
  }

  if (parts.length === 0) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return parts.join(' | ');
}

export function isSerpApiRotationError(error: unknown): boolean {
  const err = error as UnknownRecord;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status && [401, 402, 403, 429].includes(status)) return true;

  const text = errorToText(error).toLowerCase();

  return (
    text.includes('out of searches') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('insufficient') ||
    text.includes('billing') ||
    text.includes('invalid api key') ||
    text.includes('invalid key') ||
    text.includes('serpapi error')
  );
}

export function isOpenAIRotationError(error: unknown): boolean {
  const err = error as UnknownRecord;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status && [401, 402, 403, 429].includes(status)) return true;

  const text = errorToText(error).toLowerCase();

  return (
    text.includes('insufficient_quota') ||
    text.includes('billing_hard_limit_reached') ||
    text.includes('rate_limit_exceeded') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('invalid_api_key') ||
    text.includes('invalid api key') ||
    text.includes('api key')
  );
}

export async function withApiKeyRotation<T>(
  keys: string[],
  executor: (apiKey: string, index: number) => Promise<T>,
  shouldRotate: (error: unknown) => boolean,
  label: string
): Promise<{ value: T; usedKey: string; usedIndex: number; attempts: number }> {
  const usableKeys = compactUnique(keys);
  if (usableKeys.length === 0) {
    throw new Error(`No ${label} keys available`);
  }

  const errors: string[] = [];

  for (let index = 0; index < usableKeys.length; index++) {
    const apiKey = usableKeys[index];

    try {
      const value = await executor(apiKey, index);
      return {
        value,
        usedKey: apiKey,
        usedIndex: index,
        attempts: index + 1,
      };
    } catch (error) {
      const text = errorToText(error);
      errors.push(`[key ${index + 1}] ${text}`);

      const canRotate = index < usableKeys.length - 1 && shouldRotate(error);
      if (canRotate) {
        continue;
      }

      throw new Error(`All ${label} keys failed. Last error: ${text}`);
    }
  }

  throw new Error(`All ${label} keys failed. Details: ${errors.join(' || ')}`);
}
