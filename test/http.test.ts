import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, MemoryCache, type FetchLike } from '../src/http.js';

describe('HTTP resilience', () => {
  it('retries one transient response', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as FetchLike;
    const response = await fetchWithRetry(mock, 'https://example.test', {}, 100, 1);
    expect(response.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('aborts each timed-out attempt and then fails', async () => {
    const mock = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as unknown as FetchLike;
    await expect(fetchWithRetry(mock, 'https://example.test', {}, 5, 1)).rejects.toThrow('Timed out');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates cached in-flight work and expires entries', async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache<number>(100);
    const factory = vi.fn(async () => 7);
    expect(await Promise.all([cache.getOrCreate('x', factory), cache.getOrCreate('x', factory)])).toEqual([7, 7]);
    expect(factory).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(101);
    expect(await cache.getOrCreate('x', factory)).toBe(7);
    expect(factory).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
