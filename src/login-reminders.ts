import { normalizeVaultHostname } from './vault';
import { loadPreferences } from './preferences';

export const LOGIN_REMINDER_SITES_KEY = 'loginReminderOrigins';
export const LOGIN_REMINDER_VISITED_KEY = 'loginReminderVisitedHosts';
export const LOGIN_REMINDER_SUPPRESSED_KEY = 'loginReminderSuppressedHosts';
export const LOGIN_REMINDER_SCRIPT_PREFIX = 'exaisec-login-';

export interface ReminderSiteTarget {
  origin: string;
  hostname: string;
  permissionPattern: string;
  registrationMatch: string;
}

export interface LoginReminderDebugStatus {
  permissionGranted: boolean;
  siteOriginAuthorized: boolean;
  contentScriptRegistered: boolean;
  contentScriptActive: boolean;
  passwordFieldDetected: boolean | null;
  reminderSuppressed: boolean;
  reminderRendered: boolean | null;
  dismissedThisDocument: boolean | null;
  detectionSentThisDocument: boolean | null;
}

export type ContentReminderMessage =
  | { type: 'GET_LOGIN_REMINDER_CONFIG'; origin: string }
  | { type: 'LOGIN_FORM_DETECTED'; origin: string }
  | { type: 'LOGIN_REMINDER_ACTION'; origin: string; action: 'create' | 'open' | 'suppress' };

export interface ReminderSender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}

export function reminderTargetForUrl(value: unknown): ReminderSiteTarget | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) return null;
    const hostname = normalizeVaultHostname(url.hostname);
    if (!hostname) return null;
    const origin = url.origin;
    const scope = `${url.protocol}//${hostname}`;
    return { origin, hostname, permissionPattern: `${scope}/*`, registrationMatch: `${scope}/*` };
  } catch { return null; }
}

function isCanonicalOrigin(value: unknown): ReminderSiteTarget | null {
  if (typeof value !== 'string') return null;
  const target = reminderTargetForUrl(value);
  return target?.origin === value ? target : null;
}

export function validateContentReminderMessage(value: unknown, sender: ReminderSender, extensionId: string): ContentReminderMessage | null {
  if (sender.id !== extensionId || sender.frameId !== 0 || !Number.isSafeInteger(sender.tab?.id) || (sender.tab?.id ?? -1) < 0 || !sender.url) return null;
  const senderTarget = reminderTargetForUrl(sender.url);
  if (!senderTarget) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const target = isCanonicalOrigin(message.origin);
  if (!target || target.origin !== senderTarget.origin) return null;
  if (message.type === 'GET_LOGIN_REMINDER_CONFIG' || message.type === 'LOGIN_FORM_DETECTED') {
    if (Object.keys(message).length !== 2) return null;
    return { type: message.type, origin: target.origin };
  }
  if (message.type === 'LOGIN_REMINDER_ACTION' && (message.action === 'create' || message.action === 'open' || message.action === 'suppress') && Object.keys(message).length === 3) {
    return { type: message.type, origin: target.origin, action: message.action };
  }
  return null;
}

export function remindersEnabledForSite(globalEnabled: boolean, origin: string, authorizedOrigins: readonly string[], suppressedHosts: readonly string[]): boolean {
  const target = isCanonicalOrigin(origin);
  if (!globalEnabled || !target || !authorizedOrigins.includes(target.origin)) return false;
  return !suppressedHosts.includes(target.hostname);
}

export function nextReminderKind(hostname: string, visitedHosts: readonly string[]): { kind: 'first' | 'returning'; visitedHosts: string[] } {
  const host = normalizeVaultHostname(hostname);
  if (!host) throw new Error('Invalid reminder hostname.');
  if (visitedHosts.includes(host)) return { kind: 'returning', visitedHosts: [...visitedHosts] };
  return { kind: 'first', visitedHosts: [...visitedHosts, host] };
}

export interface PermissionRequestResult {
  target: ReminderSiteTarget;
  promise: Promise<boolean>;
}

type HostPermissionRequest = (permissions: { origins: string[] }, callback: (granted: boolean) => void) => Promise<boolean> | void;

/** Chrome reports callback API errors through runtime.lastError and promise API errors through rejection. */
export function requestOptionalHostPermission(
  origins: string[],
  request: HostPermissionRequest = (permissions, callback) => chrome.permissions.request(permissions, callback),
  getLastError: () => { message?: string } | undefined = () => chrome.runtime.lastError,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (granted: boolean) => { if (!settled) { settled = true; resolve(granted); } };
    const rejectOnce = (error: unknown) => { if (!settled) { settled = true; reject(error); } };
    try {
      const pending = request({ origins }, (granted) => {
        const lastError = getLastError();
        if (lastError) rejectOnce(new Error(lastError.message || 'Chrome reported a permission request error.'));
        else resolveOnce(granted);
      });
      if (pending && typeof pending.then === 'function') void pending.then(resolveOnce, rejectOnce);
    } catch (error) { rejectOnce(error); }
  });
}

export class ReminderPermissionError extends Error {
  constructor(readonly stage: 'permission' | 'registration' | 'activation', message: string) {
    super(message);
    this.name = 'ReminderPermissionError';
  }
}

/** Keep Chrome's rejected promise/lastError detail, but avoid exposing stacks in the popup. */
export function describeReminderError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 220);
  if (typeof error === 'string' && error.trim()) return error.trim().slice(0, 220);
  return 'Chrome did not provide an error description.';
}

/** Call from the click handler; the permission request is invoked synchronously during that gesture. */
export function beginSitePermissionRequest(url: string, request: (origins: string[]) => Promise<boolean>): PermissionRequestResult | null {
  const target = reminderTargetForUrl(url);
  if (!target) return null;
  try {
    // Invoke synchronously from the calling click handler; do not await anything first.
    return { target, promise: request([target.permissionPattern]) };
  } catch (error) {
    return { target, promise: Promise.reject(new ReminderPermissionError('permission', describeReminderError(error))) };
  }
}

export async function finishSitePermissionRequest(
  request: PermissionRequestResult,
  enable: (target: ReminderSiteTarget) => Promise<unknown>,
): Promise<'denied' | 'enabled'> {
  let granted: boolean;
  try { granted = await request.promise; }
  catch (error) { throw new ReminderPermissionError('permission', describeReminderError(error)); }
  if (!granted) return 'denied';
  try { await enable(request.target); }
  catch (error) {
    if (error instanceof ReminderPermissionError) throw error;
    throw new ReminderPermissionError('registration', describeReminderError(error));
  }
  return 'enabled';
}

export async function activateReminderForSite(
  target: ReminderSiteTarget,
  tabId: number,
  getTab: (tabId: number) => Promise<{ url?: string }>,
  inject: (tabId: number) => Promise<unknown>,
): Promise<'injected' | 'tab-changed'> {
  await registerReminderOrigin(target);
  try {
    const current = await getTab(tabId);
    if (reminderTargetForUrl(current.url)?.origin !== target.origin) return 'tab-changed';
    await inject(tabId);
    return 'injected';
  } catch (error) {
    throw new ReminderPermissionError('activation', describeReminderError(error));
  }
}

export function sanitizedHostList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hosts = value.map(normalizeVaultHostname).filter((host): host is string => host !== null);
  return [...new Set(hosts)];
}

function canonicalOriginList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const origins = value.map((origin) => isCanonicalOrigin(origin)?.origin ?? null).filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}

export async function loadAuthorizedReminderOrigins(): Promise<string[]> {
  const stored = await chrome.storage.local.get(LOGIN_REMINDER_SITES_KEY);
  return canonicalOriginList(stored[LOGIN_REMINDER_SITES_KEY]);
}

export async function loadSuppressedReminderHosts(): Promise<string[]> {
  const stored = await chrome.storage.local.get(LOGIN_REMINDER_SUPPRESSED_KEY);
  return sanitizedHostList(stored[LOGIN_REMINDER_SUPPRESSED_KEY]);
}

export async function updateSuppressedReminderHost(hostname: string, suppress: boolean): Promise<void> {
  const host = normalizeVaultHostname(hostname);
  if (!host) throw new Error('Invalid reminder hostname.');
  const current = await loadSuppressedReminderHosts();
  const next = suppress ? [...new Set([...current, host])] : current.filter((item) => item !== host);
  await chrome.storage.local.set({ [LOGIN_REMINDER_SUPPRESSED_KEY]: next });
}

export async function registerReminderOrigin(target: ReminderSiteTarget): Promise<void> {
  if (!(await loadPreferences()).smartPasswordHintReminders) throw new Error('Enable Smart Password Hint Reminders in Settings first.');
  if (!await chrome.permissions.contains({ origins: [target.permissionPattern] })) throw new Error('The site permission is no longer granted.');
  const scriptId = scriptIdForTarget(target);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
  if (existing.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: scriptId,
      matches: [target.registrationMatch],
      js: ['login-content.js'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    }]);
  }
  const origins = await loadAuthorizedReminderOrigins();
  await chrome.storage.local.set({ [LOGIN_REMINDER_SITES_KEY]: [...new Set([...origins, target.origin])] });
}

function scriptIdForTarget(target: ReminderSiteTarget): string {
  const source = `${new URL(target.origin).protocol}//${target.hostname}`;
  let hash = 0xcbf29ce484222325n;
  for (const character of source) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${LOGIN_REMINDER_SCRIPT_PREFIX}${hash.toString(36)}`;
}

export async function isReminderScriptRegistered(target: ReminderSiteTarget): Promise<boolean> {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptIdForTarget(target)] });
  return scripts.some((script) => script.id === scriptIdForTarget(target));
}

export async function removeReminderOrigin(origin: string): Promise<void> {
  const target = isCanonicalOrigin(origin);
  if (!target) throw new Error('Invalid reminder origin.');
  const current = await loadAuthorizedReminderOrigins();
  const next = current.filter((item) => item !== target.origin);
  await chrome.storage.local.set({ [LOGIN_REMINDER_SITES_KEY]: next });
  await stopReminderScriptsOnOrigin(target.origin);
  const samePermission = next.some((item) => reminderTargetForUrl(item)?.permissionPattern === target.permissionPattern);
  if (!samePermission) {
    const scriptId = scriptIdForTarget(target);
    try { await chrome.scripting.unregisterContentScripts({ ids: [scriptId] }); } catch { /* It may already have been removed by Chrome. */ }
    try { await chrome.permissions.remove({ origins: [target.permissionPattern] }); } catch { /* Chrome may already have revoked this optional permission. */ }
  }
}

export async function disableAllReminderSites(): Promise<void> {
  const origins = await loadAuthorizedReminderOrigins();
  await Promise.all(origins.map((origin) => stopReminderScriptsOnOrigin(origin).catch(() => undefined)));
  await chrome.storage.local.set({ [LOGIN_REMINDER_SITES_KEY]: [], [LOGIN_REMINDER_VISITED_KEY]: [] });
  const registrations = await chrome.scripting.getRegisteredContentScripts({});
  const ids = registrations.filter((script) => script.id.startsWith(LOGIN_REMINDER_SCRIPT_PREFIX)).map((script) => script.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  const patterns = [...new Set(origins.map((origin) => reminderTargetForUrl(origin)?.permissionPattern).filter((item): item is string => !!item))];
  if (patterns.length) await chrome.permissions.remove({ origins: patterns });
}

export async function stopReminderScriptsOnOrigin(origin: string): Promise<void> {
  const target = isCanonicalOrigin(origin);
  if (!target) return;
  let tabs: chrome.tabs.Tab[];
  try { tabs = await chrome.tabs.query({ url: [target.permissionPattern] }); }
  catch { return; }
  await Promise.all(tabs.flatMap((tab) => {
    if (tab.id === undefined || reminderTargetForUrl(tab.url)?.origin !== target.origin) return [];
    return [chrome.tabs.sendMessage(tab.id, { type: 'STOP_LOGIN_REMINDER', origin: target.origin }).catch(() => undefined)];
  }));
}
