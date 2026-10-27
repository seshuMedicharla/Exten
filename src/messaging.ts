import type { ExtensionRequest, ExtensionResponse, ReportResult } from './types';

export function isRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.type === 'GET_ACTIVE_REPORT') return true;
  if (request.type === 'GET_TAB_REPORT' || request.type === 'OPEN_REPORT' || request.type === 'INSPECT_PAGE') return Number.isSafeInteger(request.tabId) && Number(request.tabId) >= 0;
  return false;
}
export async function sendRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}
export function asReportResult(response: ExtensionResponse): ReportResult {
  if ('type' in response || !('status' in response)) return { status: 'error', reason: 'Unexpected response from extension service worker.' };
  switch (response.status) {
    case 'opened': case 'ignored': case 'suppressed': case 'show': return { status: 'error', reason: 'Unexpected response from extension service worker.' };
    default: return response;
  }
}
