import { watchForLoginForm } from './login-detector';
import { REMINDER_HOST_LAYER_STYLE } from './reminder-layer';

type ReminderKind = 'first' | 'returning';
type ConfigResponse = { enabled: boolean };
type DetectionResponse = { status: 'ignored' } | { status: 'show'; kind: ReminderKind };
const DEBUG_STATUS_TYPE = 'GET_LOGIN_REMINDER_DEBUG_STATUS';

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validConfig(value: unknown): value is ConfigResponse {
  return hasExactKeys(value, ['enabled']) && typeof value.enabled === 'boolean';
}

function validDetection(value: unknown): value is DetectionResponse {
  return (hasExactKeys(value, ['status']) && value.status === 'ignored') ||
    (hasExactKeys(value, ['status', 'kind']) && value.status === 'show' && (value.kind === 'first' || value.kind === 'returning'));
}

let activeReminderHost: HTMLElement | null = null;
let reminderActive = false;
let passwordFieldDetected = false;
let dismissedThisDocument = false;
let detectionSentThisDocument = false;
function renderReminder(kind: ReminderKind, origin: string): HTMLElement | null {
  if (activeReminderHost) return null;
  const host = document.createElement('div');
  host.id = 'exaisec-login-reminder-host';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    ${REMINDER_HOST_LAYER_STYLE}
    *{box-sizing:border-box}section{pointer-events:auto;background:#fff;border:1px solid #cfe0e8;border-radius:14px;box-shadow:0 12px 38px #102c4440;padding:16px}
    header{display:flex;align-items:center;gap:9px;margin-bottom:9px}.mark{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:8px;background:#e7f7f6;color:#087f83;font-size:16px;font-weight:800}.brand{font-size:13px;font-weight:800;color:#15364e}p{margin:0;color:#547084;font-size:13px;line-height:1.45}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}button{border:1px solid #d4e3ea;border-radius:8px;background:#f5f9fb;color:#254c63;padding:8px 10px;font:600 12px system-ui;cursor:pointer}button.primary{background:#075fb9;border-color:#075fb9;color:#fff}button:hover{filter:brightness(.97)}button:focus-visible{outline:3px solid #1cabb2;outline-offset:2px}
  `;
  const card = document.createElement('section');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'ExAiSec password hint reminder');
  card.setAttribute('aria-live', 'polite');
  const header = document.createElement('header');
  const mark = document.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = '✓';
  const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'ExAiSec';
  header.append(mark, brand);
  const message = document.createElement('p');
  message.textContent = kind === 'first'
    ? 'Would you like to create a non-sensitive password hint for this website?'
    : 'Open ExAiSec to view password hints for this website.';
  const actions = document.createElement('div'); actions.className = 'actions';
  const makeButton = (label: string, action: 'create' | 'open' | 'suppress' | 'dismiss', primary = false) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    if (primary) button.className = 'primary';
    button.addEventListener('click', () => {
      if (action === 'dismiss') { dismissedThisDocument = true; host.remove(); return; }
      button.disabled = true;
      void chrome.runtime.sendMessage({ type: 'LOGIN_REMINDER_ACTION', origin, action }).then((response: unknown) => {
        if (hasExactKeys(response, ['status']) && (response.status === 'opened' || response.status === 'suppressed')) {
          dismissedThisDocument = true;
          host.remove();
        }
        else button.disabled = false;
      }).catch(() => { button.disabled = false; });
    });
    return button;
  };
  if (kind === 'first') actions.append(makeButton('Create Hint', 'create', true));
  else actions.append(makeButton('Open ExAiSec', 'open', true));
  actions.append(makeButton('Not Now', 'dismiss'));
  actions.append(makeButton("Don't Remind Me on This Site", 'suppress'));
  card.append(header, message, actions);
  shadow.append(style, card);
  document.documentElement.append(host);
  return host;
}

let stopped = false;
let stopWatching: () => void = () => {};
const stopCurrentReminder = () => {
  stopped = true;
  reminderActive = false;
  stopWatching();
  activeReminderHost?.remove(); activeReminderHost = null;
  chrome.runtime.onMessage.removeListener(stopMessageListener);
  chrome.storage.onChanged.removeListener(storageChangeListener);
};
function stopMessageListener(message: unknown, sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id || !hasExactKeys(message, ['type', 'origin'])) return;
  if (message.type === 'STOP_LOGIN_REMINDER' && message.origin === location.origin) stopCurrentReminder();
}
function storageChangeListener(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string): void {
  if (areaName !== 'local' || !changes.preferences) return;
  const value = changes.preferences.newValue as { smartPasswordHintReminders?: unknown } | undefined;
  if (value?.smartPasswordHintReminders !== true) stopCurrentReminder();
}

function debugStatusListener(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean {
  if (sender.id !== chrome.runtime.id || !hasExactKeys(message, ['type', 'origin'])) return false;
  if (message.type !== DEBUG_STATUS_TYPE || message.origin !== location.origin) return false;
  sendResponse({
    type: 'LOGIN_REMINDER_DEBUG_STATUS',
    origin: location.origin,
    contentScriptActive: reminderActive && !stopped,
    passwordFieldDetected,
    reminderRendered: activeReminderHost?.isConnected === true,
    dismissedThisDocument,
    detectionSentThisDocument,
  });
  return false;
}

// The popup receives only bounded booleans, never page content or input data.
chrome.runtime.onMessage.addListener(debugStatusListener);

async function start(): Promise<void> {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  const origin = location.origin;
  chrome.runtime.onMessage.addListener(stopMessageListener);
  chrome.storage.onChanged.addListener(storageChangeListener);
  try {
    const config: unknown = await chrome.runtime.sendMessage({ type: 'GET_LOGIN_REMINDER_CONFIG', origin });
    if (!validConfig(config) || !config.enabled) { stopCurrentReminder(); return; }
    if (stopped) return;
    reminderActive = true;
    stopWatching = watchForLoginForm(document, () => {
      if (stopped) return;
      if (detectionSentThisDocument) return;
      detectionSentThisDocument = true;
      passwordFieldDetected = true;
      void chrome.runtime.sendMessage({ type: 'LOGIN_FORM_DETECTED', origin }).then((response: unknown) => {
        if (!stopped && validDetection(response) && response.status === 'show') activeReminderHost = renderReminder(response.kind, origin);
      }).catch(() => undefined);
    });
  } catch { stopCurrentReminder(); /* No permission or service-worker response: inspect nothing and show nothing. */ }
}

void start();
