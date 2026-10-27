import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const get = vi.fn();
const create = vi.fn();
const addListener = vi.fn();
const executeScript = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension-id', getURL: (path: string) => `chrome-extension://extension-id/${path}`, onMessage: { addListener } },
    tabs: { query, get, create },
    scripting: { executeScript },
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
});

describe('background messaging', () => {
  it('inspects the active tab and opens its report', async () => {
    query.mockResolvedValue([{ id: 4, url: 'https://example.com/path?secret=abc' }]);
    get.mockResolvedValue({ id: 4, url: 'https://example.com/path?secret=abc' });
    create.mockResolvedValue({ id: 5 });
    const { handleRequest } = await import('./background');
    const active = await handleRequest({ type: 'GET_ACTIVE_REPORT' });
    if (!('status' in active)) throw new Error('Unexpected inspection response');
    expect(active.status).toBe('ready');
    if (active.status === 'ready') expect(active.report.url).toBe('https://example.com/path');
    if (active.status === 'ready') expect(active.report.ml.status).toBe('unavailable');
    expect(await handleRequest({ type: 'OPEN_REPORT', tabId: 4 })).toEqual({ status: 'opened' });
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://extension-id/report.html?tabId=4' });
  });
  it('handles an unavailable original tab', async () => {
    get.mockRejectedValue(new Error('tab closed'));
    const { handleRequest } = await import('./background');
    const response = await handleRequest({ type: 'GET_TAB_REPORT', tabId: 9 });
    expect('status' in response && response.status).toBe('error');
  });
  it('inspects only the top frame after an explicit request and warns for HTTP password fields', async () => {
    get.mockResolvedValue({ id: 8, url: 'http://example.com/login' });
    executeScript.mockResolvedValue([{ frameId: 0, result: { version: 1, bannerDetected: false, categories: [], passwordFieldPresent: true } }]);
    const { handleRequest } = await import('./background');
    const response = await handleRequest({ type: 'INSPECT_PAGE', tabId: 8 });
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 8, frameIds: [0] }, world: 'ISOLATED' }));
    expect(response).toMatchObject({ type: 'PAGE_INSPECTION_RESULT', result: { status: 'analyzed', data: { httpLoginWarning: true, passwordFieldPresent: true } } });
  });
  it('does not flag HTTPS password forms as HTTP exposure', async () => {
    get.mockResolvedValue({ id: 8, url: 'https://example.com/login' });
    executeScript.mockResolvedValue([{ frameId: 0, result: { version: 1, bannerDetected: false, categories: [], passwordFieldPresent: true } }]);
    const { handleRequest } = await import('./background');
    expect(await handleRequest({ type: 'INSPECT_PAGE', tabId: 8 })).toMatchObject({ result: { status: 'analyzed', data: { httpLoginWarning: false, passwordFieldPresent: true } } });
  });
  it('does not inject on unsupported pages or after permission failures', async () => {
    get.mockResolvedValueOnce({ id: 8, url: 'chrome://settings/' }).mockResolvedValue({ id: 8, url: 'https://example.com/' });
    executeScript.mockRejectedValue(new Error('Cannot access contents of URL'));
    const { handleRequest } = await import('./background');
    expect(await handleRequest({ type: 'INSPECT_PAGE', tabId: 8 })).toMatchObject({ result: { status: 'unavailable', kind: 'unsupported-page' } });
    expect(executeScript).not.toHaveBeenCalled();
    expect(await handleRequest({ type: 'INSPECT_PAGE', tabId: 8 })).toMatchObject({ result: { status: 'unavailable', kind: 'permission-denied' } });
  });
  it('discards observations if the tab changes during inspection', async () => {
    get.mockResolvedValueOnce({ id: 8, url: 'https://example.com/' }).mockResolvedValueOnce({ id: 8, url: 'https://another.example/' });
    executeScript.mockResolvedValue([{ frameId: 0, result: { version: 1, bannerDetected: true, categories: ['analytics'], passwordFieldPresent: false } }]);
    const { handleRequest } = await import('./background');
    expect(await handleRequest({ type: 'INSPECT_PAGE', tabId: 8 })).toMatchObject({ result: { status: 'unavailable', kind: 'page-changed' } });
  });
});
