import { isRequest } from './messaging';
import { inspectUrl } from './url-analysis';
import { analyzeWithLocalApi } from './ml-client';
import { inspectPageDom, validatePageDomObservation } from './page-inspector';
import { loadAuthorizedReminderOrigins, loadSuppressedReminderHosts, LOGIN_REMINDER_VISITED_KEY, nextReminderKind, reminderTargetForUrl, remindersEnabledForSite, removeReminderOrigin, sanitizedHostList, stopReminderScriptsOnOrigin, updateSuppressedReminderHost, validateContentReminderMessage } from './login-reminders';
import { loadPreferences } from './preferences';
import type { ExtensionRequest, ExtensionResponse, PageInspectionResult, ReportResult } from './types';

async function reportForTab(tab: chrome.tabs.Tab | undefined): Promise<ReportResult> {
  if (!tab || tab.id === undefined) return { status: 'error', reason: 'No active browser tab was found.' };
  const result = inspectUrl(tab.url, tab.id);
  if (result.status !== 'ready') return result;
  return { status: 'ready', report: { ...result.report, ml: await analyzeWithLocalApi(result.report.url) } };
}

export async function inspectTabPage(tabId: number): Promise<PageInspectionResult> {
  let tab: chrome.tabs.Tab;
  try { tab = await chrome.tabs.get(tabId); }
  catch { return { status: 'unavailable', kind: 'permission-denied', reason: 'The original tab is unavailable or Chrome did not grant access.' }; }
  const site = inspectUrl(tab.url, tabId);
  if (site.status === 'unsupported') return { status: 'unavailable', kind: 'unsupported-page', reason: 'Page inspection supports HTTP and HTTPS websites only.' };
  if (site.status === 'permission-denied') return { status: 'unavailable', kind: 'permission-denied', reason: 'Chrome did not provide access to this tab.' };
  if (site.status !== 'ready') return { status: 'error', reason: 'The current tab could not be inspected.' };

  try {
    const frames = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: inspectPageDom });
    if (frames.length !== 1 || frames[0].frameId !== 0) return { status: 'error', reason: 'The top frame did not return a valid inspection result.' };
    const observation = validatePageDomObservation(frames[0].result);
    if (!observation) return { status: 'error', reason: 'The page returned an invalid inspection result.' };
    const currentTab = await chrome.tabs.get(tabId);
    if (currentTab.url !== tab.url) return { status: 'unavailable', kind: 'page-changed', reason: 'The page changed during inspection. Try again.' };
    return { status: 'analyzed', data: { bannerDetected: observation.bannerDetected, categories: observation.categories, passwordFieldPresent: observation.passwordFieldPresent, httpLoginWarning: site.report.protocol === 'http:' && observation.passwordFieldPresent, inspectedAt: Date.now() } };
  } catch {
    return { status: 'unavailable', kind: 'permission-denied', reason: 'Chrome could not inspect this page. Check page access and try again.' };
  }
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
  if (request.type === 'INSPECT_PAGE') return { type: 'PAGE_INSPECTION_RESULT', result: await inspectTabPage(request.tabId) };
  const tab = await chrome.tabs.get(request.tabId);
  const report = tab.id === undefined ? { status: 'error' as const, reason: 'No active browser tab was found.' } : inspectUrl(tab.url, tab.id);
  if (report.status !== 'ready') return report;
  await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?tabId=${request.tabId}`) });
  return { status: 'opened' };
}

async function reminderSiteIsEnabled(origin: string): Promise<boolean> {
  const target = new URL(origin);
  const [preferences, origins, suppressed] = await Promise.all([loadPreferences(), loadAuthorizedReminderOrigins(), loadSuppressedReminderHosts()]);
  if (!remindersEnabledForSite(preferences.smartPasswordHintReminders, origin, origins, suppressed)) return false;
  const hostPattern = `${target.protocol}//${target.hostname}/*`;
  return chrome.permissions.contains({ origins: [hostPattern] });
}

async function handleContentReminderMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const request = validateContentReminderMessage(message, sender, chrome.runtime.id);
  if (!request) return { status: 'ignored' };
  const target = new URL(request.origin);
  if (request.type === 'GET_LOGIN_REMINDER_CONFIG') return { enabled: await reminderSiteIsEnabled(request.origin) };
  if (!await reminderSiteIsEnabled(request.origin)) return { status: 'ignored' };

  if (request.type === 'LOGIN_FORM_DETECTED') {
    const storage = await chrome.storage.local.get(LOGIN_REMINDER_VISITED_KEY);
    const state = nextReminderKind(target.hostname, sanitizedHostList(storage[LOGIN_REMINDER_VISITED_KEY]));
    await chrome.storage.local.set({ [LOGIN_REMINDER_VISITED_KEY]: state.visitedHosts });
    return { status: 'show', kind: state.kind };
  }

  if (request.action === 'suppress') {
    await updateSuppressedReminderHost(target.hostname, true);
    const origins = await loadAuthorizedReminderOrigins();
    await Promise.all(origins.filter((origin) => reminderTargetForUrl(origin)?.hostname === target.hostname).map((origin) => stopReminderScriptsOnOrigin(origin).catch(() => undefined)));
    return { status: 'suppressed' };
  }

  const params = new URLSearchParams({ siteHost: target.hostname });
  if (request.action === 'create') params.set('create', '1');
  await chrome.tabs.create({ url: chrome.runtime.getURL(`vault.html?${params.toString()}`) });
  return { status: 'opened' };
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: ExtensionResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  const messageType = message && typeof message === 'object' && !Array.isArray(message) ? (message as Record<string, unknown>).type : undefined;
  if (messageType === 'GET_LOGIN_REMINDER_CONFIG' || messageType === 'LOGIN_FORM_DETECTED' || messageType === 'LOGIN_REMINDER_ACTION') {
    void handleContentReminderMessage(message, sender).then((response) => sendResponse(response as ExtensionResponse)).catch(() => sendResponse({ status: 'ignored' }));
    return true;
  }
  if (!isRequest(message)) {
    sendResponse({ status: 'error', reason: 'Invalid extension request.' });
    return false;
  }
  void handleRequest(message).then(sendResponse).catch(() => sendResponse({ status: 'error', reason: 'The extension could not complete the request. Try again.' }));
  return true;
});

chrome.permissions.onRemoved.addListener((removed) => {
  const removedPatterns = new Set(removed.origins ?? []);
  if (!removedPatterns.size) return;
  void loadAuthorizedReminderOrigins().then((origins) => Promise.all(origins.filter((origin) => {
    const site = reminderTargetForUrl(origin);
    return site && removedPatterns.has(site.permissionPattern);
  }).map((origin) => removeReminderOrigin(origin).catch(() => undefined))));
});
