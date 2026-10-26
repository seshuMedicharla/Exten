import { describe, expect, it } from 'vitest';
import { hasCaution, inspectUrl, visibleIndicators } from './url-analysis';

describe('inspectUrl', () => {
  it('reports HTTPS as an observation without declaring safety', () => {
    const result = inspectUrl('https://example.com/account', 7, 123);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.report).toMatchObject({ tabId: 7, hostname: 'example.com', protocol: 'https:', inspectedAt: 123 });
    expect(result.report.indicators.map((item) => item.id)).toEqual(['https']);
    expect(hasCaution(result.report, true)).toBe(false);
  });
  it('flags HTTP and visible URL syntax', () => {
    const result = inspectUrl('http://user@example.com:8080/login', 3);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.report.indicators.map((item) => item.id)).toEqual(['http', 'credentials', 'custom-port']);
    expect(result.report.url).toBe('http://example.com:8080/login');
    expect(hasCaution(result.report, true)).toBe(true);
    expect(visibleIndicators(result.report, false).some((item) => item.id === 'http')).toBe(false);
  });
  it.each(['chrome://settings/', 'file:///tmp/test.html', 'about:blank', 'chrome-extension://abc/popup.html'])('rejects unsupported page %s', (url) => {
    expect(inspectUrl(url, 1).status).toBe('unsupported');
  });
  it('handles inaccessible, malformed, and oversized addresses', () => {
    expect(inspectUrl(undefined, 1).status).toBe('permission-denied');
    expect(inspectUrl('not a url', 1).status).toBe('unsupported');
    expect(inspectUrl(`https://example.com/${'a'.repeat(8200)}`, 1).status).toBe('unsupported');
  });
  it('recognizes IP and encoded hostnames', () => {
    const ip = inspectUrl('https://192.0.2.1/', 1);
    const encoded = inspectUrl('https://xn--bcher-kva.example/', 1);
    expect(ip.status === 'ready' && ip.report.indicators.some((item) => item.id === 'ip-address')).toBe(true);
    expect(encoded.status === 'ready' && encoded.report.indicators.some((item) => item.id === 'punycode')).toBe(true);
  });
  it('does not return query tokens or fragments to UI', () => {
    const result = inspectUrl('https://example.com/path?token=secret#private', 1);
    expect(result.status === 'ready' && result.report.url).toBe('https://example.com/path');
  });
});
