export class HttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export type FetchLike = typeof fetch;

export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = 8_000,
  retries = 1
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    try {
      const response = await fetchFn(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const error = new HttpError(`HTTP ${response.status} from ${new URL(url).hostname}`, response.status);
        if (response.status >= 500 || response.status === 408 || response.status === 429) throw error;
        throw Object.assign(error, { transient: false });
      }
      return response;
    } catch (error) {
      lastError = error;
      const transient = !(error instanceof HttpError) || error.status === undefined || error.status >= 500 || error.status === 408 || error.status === 429;
      if (attempt >= retries || !transient) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function fetchJson(
  fetchFn: FetchLike,
  url: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetchWithRetry(fetchFn, url, init, timeoutMs);
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Malformed JSON from ${new URL(url).hostname}`);
  }
}

export class MemoryCache<T> {
  private readonly entries = new Map<string, { expires: number; value: Promise<T> }>();

  constructor(private readonly ttlMs: number) {}

  getOrCreate(key: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.expires > now) return existing.value;
    const value = factory().catch((error) => {
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, { expires: now + this.ttlMs, value });
    return value;
  }

  clear(): void { this.entries.clear(); }
}
