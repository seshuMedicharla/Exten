import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const get = vi.fn();
const create = vi.fn();
const addListener = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension-id', getURL: (path: string) => `chrome-extension://extension-id/${path}`, onMessage: { addListener } },
    tabs: { query, get, create },
  });
});

describe('background messaging', () => {
  it('inspects the active tab and opens its report', async () => {
    query.mockResolvedValue([{ id: 4, url: 'https://example.com/path?secret=abc' }]);
    get.mockResolvedValue({ id: 4, url: 'https://example.com/path?secret=abc' });
    create.mockResolvedValue({ id: 5 });
    const { handleRequest } = await import('./background');
    const active = await handleRequest({ type: 'GET_ACTIVE_REPORT' });
    expect(active.status).toBe('ready');
    if (active.status === 'ready') expect(active.report.url).toBe('https://example.com/path');
    expect(await handleRequest({ type: 'OPEN_REPORT', tabId: 4 })).toEqual({ status: 'opened' });
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://extension-id/report.html?tabId=4' });
  });
  it('handles an unavailable original tab', async () => {
    get.mockRejectedValue(new Error('tab closed'));
    const { handleRequest } = await import('./background');
    expect((await handleRequest({ type: 'GET_TAB_REPORT', tabId: 9 })).status).toBe('error');
  });
});
