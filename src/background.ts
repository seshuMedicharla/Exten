import { isRequest } from './messaging';
import { inspectUrl } from './url-analysis';
import type { ExtensionRequest, ExtensionResponse, ReportResult } from './types';

async function reportForTab(tab: chrome.tabs.Tab | undefined): Promise<ReportResult> {
  if (!tab || tab.id === undefined) return { status: 'error', reason: 'No active browser tab was found.' };
  return inspectUrl(tab.url, tab.id);
}

export async function handleRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  if (request.type === 'GET_ACTIVE_REPORT') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return reportForTab(tabs[0]);
  }
  if (request.type === 'GET_TAB_REPORT') {
    try { return reportForTab(await chrome.tabs.get(request.tabId)); }
    catch { return { status: 'error', reason: 'The original tab is no longer available. Return to a website and reopen ExAiSec.' }; }
  }
  const tab = await chrome.tabs.get(request.tabId);
  const report = await reportForTab(tab);
  if (report.status !== 'ready') return report;
  await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?tabId=${request.tabId}`) });
  return { status: 'opened' };
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: ExtensionResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (!isRequest(message)) {
    sendResponse({ status: 'error', reason: 'Invalid extension request.' });
    return false;
  }
  void handleRequest(message).then(sendResponse).catch(() => sendResponse({ status: 'error', reason: 'The extension could not complete the request. Try again.' }));
  return true;
});
