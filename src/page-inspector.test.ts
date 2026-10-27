import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { inspectPageDom, validatePageDomObservation } from './page-inspector';
import { pageInspectionSummaries } from './components';

function fixture(html: string): JSDOM {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: 'https://example.test/' });
  // jsdom has no layout engine. Give visible fixture elements an on-screen box.
  vi.spyOn(dom.window.Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10, y: 10, top: 10, left: 10, bottom: 110, right: 310, width: 300, height: 100, toJSON: () => ({}),
  }));
  vi.stubGlobal('document', dom.window.document);
  return dom;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('top-frame DOM inspection', () => {
  it('detects a visible banner and only displayed category labels', () => {
    fixture('<div class="cookie-banner"><p>We use cookies. Accept or reject.</p><span>Essential</span><span>Marketing</span><div style="display:none">Analytics</div></div>');
    expect(inspectPageDom()).toEqual({ version: 1, bannerDetected: true, categories: ['essential', 'marketing'], passwordFieldPresent: false });
  });
  it('reports a visible generic banner with undetermined categories', () => {
    fixture('<div id="cookie-consent">We use cookies. <button>Accept</button></div>');
    expect(inspectPageDom()).toMatchObject({ bannerDetected: true, categories: [] });
  });
  it('does not claim detection when banner text is hidden or outside a consent container', () => {
    fixture('<div class="cookie-banner" hidden>Cookies: accept. Analytics</div><main>We use cookies. Accept.</main>');
    expect(inspectPageDom()).toMatchObject({ bannerDetected: false, categories: [] });
  });
  it('detects a visible password field without reading input values', () => {
    const dom = fixture('<form><input type="text" name="username" value="alice"><input type="password" value="very-secret"></form>');
    const input = dom.window.document.querySelector('input[type="password"]')!;
    Object.defineProperty(input, 'value', { get: () => { throw new Error('Input value read'); } });
    const result = inspectPageDom();
    expect(result.passwordFieldPresent).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/alice|very-secret/);
  });
  it('reports no visible password field when absent or hidden', () => {
    fixture('<form><input type="text" name="email"><input type="password" style="display:none"></form>');
    expect(inspectPageDom().passwordFieldPresent).toBe(false);
  });
  it('rejects malformed or unbounded script results', () => {
    expect(validatePageDomObservation({ version: 1, bannerDetected: false, categories: ['marketing'], passwordFieldPresent: false })).toBeNull();
    expect(validatePageDomObservation({ version: 1, bannerDetected: true, categories: ['essential', 'essential'], passwordFieldPresent: false })).toBeNull();
    expect(validatePageDomObservation({ version: 1, bannerDetected: true, categories: ['unknown'], passwordFieldPresent: false })).toBeNull();
  });
  it('never reports consent detection after inspection is unavailable', () => {
    expect(pageInspectionSummaries({ status: 'unavailable', kind: 'permission-denied', reason: 'Access denied' })).toEqual({ privacy: 'Inspection unavailable', login: 'Inspection unavailable' });
  });
});
