import type { ReportResult, SiteReport, UrlIndicator } from './types';

export function inspectUrl(rawUrl: unknown, tabId: number, inspectedAt = Date.now()): ReportResult {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return { status: 'permission-denied', reason: 'Chrome did not provide the active tab URL. Open a website and try again.' };
  }
  if (rawUrl.length > 8192) return { status: 'unsupported', reason: 'This URL is too long to inspect.' };
  if (/\s/u.test(rawUrl) || [...rawUrl].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return { status: 'unsupported', reason: 'This tab has an invalid URL.' };
  }

  let url: URL;
  try { url = new URL(rawUrl); }
  catch { return { status: 'unsupported', reason: 'This tab has an invalid URL.' }; }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { status: 'unsupported', reason: 'ExAiSec currently inspects only HTTP and HTTPS websites.' };
  }
  if (!url.hostname || !Number.isSafeInteger(tabId) || tabId < 0) {
    return { status: 'error', reason: 'The current tab could not be inspected.' };
  }

  const indicators: UrlIndicator[] = [];
  if (url.protocol === 'http:') indicators.push({ id: 'http', title: 'Connection uses HTTP', detail: 'The URL does not request an encrypted HTTPS connection. Avoid entering sensitive information unless you verify the site through another trusted channel.', tone: 'caution' });
  else indicators.push({ id: 'https', title: 'URL uses HTTPS', detail: 'The URL requests an encrypted connection. This alone does not verify the website or its content.', tone: 'info' });
  if (url.username || url.password) indicators.push({ id: 'credentials', title: 'URL contains credentials', detail: 'Text before an @ sign can obscure the actual destination. Check the hostname carefully.', tone: 'caution' });
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith('[')) indicators.push({ id: 'ip-address', title: 'IP address used as hostname', detail: 'This address does not show a familiar domain name. Verify the destination independently.', tone: 'neutral' });
  if (url.hostname.split('.').some((part) => part.startsWith('xn--'))) indicators.push({ id: 'punycode', title: 'Encoded domain label', detail: 'The hostname contains a Punycode label. Review the destination carefully; encoded labels are not inherently malicious.', tone: 'neutral' });
  if (url.port) indicators.push({ id: 'custom-port', title: 'Nondefault port in URL', detail: `The URL specifies port ${url.port}. Confirm that this is expected for the service.`, tone: 'neutral' });

  // URL userinfo, query strings, and fragments can contain secrets. Never pass them to the UI.
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  const report: SiteReport = { tabId, url: url.href, hostname: url.hostname, protocol: url.protocol, inspectedAt, indicators, ml: { status: 'not-analyzed', reason: 'Local ML assessment has not run.' } };
  return { status: 'ready', report };
}

export function visibleIndicators(report: SiteReport, highlightHttp: boolean): UrlIndicator[] {
  return highlightHttp ? report.indicators : report.indicators.filter((item) => item.id !== 'http');
}

export function hasCaution(report: SiteReport, highlightHttp: boolean): boolean {
  return visibleIndicators(report, highlightHttp).some((item) => item.tone === 'caution');
}
