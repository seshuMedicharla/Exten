import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeWithLocalApi, parsePrediction } from './ml-client';

const validPayload = {
  model_score: 0.7,
  classification: 'elevated_signal',
  threshold: 0.62,
  model_version: 'rf-mendeley-v2-calibrated',
  observed_url_indicators: [{ id: 'https', title: 'HTTPS URL', detail: 'URL syntax only' }],
  limitations: ['Experimental result, not a safety verdict.'],
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('local ML client', () => {
  it('accepts only a consistent, bounded result', () => {
    expect(parsePrediction(validPayload).status).toBe('analyzed');
    expect(parsePrediction({ ...validPayload, model_score: 1.2 }).status).toBe('error');
    expect(parsePrediction({ ...validPayload, classification: 'below_threshold' }).status).toBe('error');
    expect(parsePrediction({ ...validPayload, model_version: 'unknown' }).status).toBe('error');
  });
  it('posts only the sanitized URL to loopback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => validPayload });
    vi.stubGlobal('fetch', fetchMock);
    expect((await analyzeWithLocalApi('https://example.com/path')).status).toBe('analyzed');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/predict', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ url: 'https://example.com/path' }), credentials: 'omit', cache: 'no-store',
    }));
  });
  it('returns Not Analyzed states for unavailable and unsupported API calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect((await analyzeWithLocalApi('https://example.com/')).status).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    expect((await analyzeWithLocalApi('https://example.com/')).status).toBe('unsupported');
  });
  it('treats malformed JSON as an error, never as an analyzed result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => { throw new SyntaxError('bad JSON'); } }));
    expect((await analyzeWithLocalApi('https://example.com/')).status).toBe('error');
  });
  it('times out a stalled API call', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const result = analyzeWithLocalApi('https://example.com/', 25);
    await vi.advanceTimersByTimeAsync(25);
    expect((await result).status).toBe('timeout');
  });
});
