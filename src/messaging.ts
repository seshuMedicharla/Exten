import type { ExtensionRequest, ExtensionResponse, ReportResult } from './types';

export function isRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.type === 'GET_ACTIVE_REPORT') return true;
  if (request.type === 'GET_TAB_REPORT' || request.type === 'OPEN_REPORT') return Number.isSafeInteger(request.tabId) && Number(request.tabId) >= 0;
  return false;
}
export async function sendRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}
export function asReportResult(response: ExtensionResponse): ReportResult {
  return response.status === 'opened' ? { status: 'error', reason: 'Unexpected response from extension service worker.' } : response;
}
