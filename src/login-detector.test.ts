import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLikelyLoginForm, watchForLoginForm } from './login-detector';
import { REMINDER_HOST_LAYER_STYLE } from './reminder-layer';

const instances: JSDOM[] = [];
function page(html = '<!doctype html><html><body></body></html>'): Document {
  const instance = new JSDOM(html, { url: 'https://example.test/login' });
  instances.push(instance);
  return instance.window.document;
}
afterEach(() => { for (const instance of instances.splice(0)) instance.window.close(); });

describe('structural login detection', () => {
  it('detects a password field without reading its value', () => {
    const document = page('<!doctype html><html><body><form><input type="password"></form></body></html>');
    const input = document.querySelector('input')!;
    Object.defineProperty(input, 'value', { get: () => { throw new Error('value must never be read'); } });
    expect(isLikelyLoginForm(document)).toBe(true);
  });

  it('does not detect pages with no password fields or hidden/disabled candidates', () => {
    const document = page('<!doctype html><html><body><input type="email"><input type="password" disabled><div hidden><input type="password"></div></body></html>');
    expect(isLikelyLoginForm(document)).toBe(false);
  });

  it('detects dynamically inserted and retyped login fields once, then stops observing', async () => {
    const document = page();
    const detected = vi.fn();
    const disconnect = watchForLoginForm(document, detected);
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    input.type = 'password';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detected).toHaveBeenCalledTimes(1);
    document.body.append(document.createElement('input'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detected).toHaveBeenCalledTimes(1);
    disconnect();
  });

  it('detects a password field when a login dialog is inserted after the initial page scan', async () => {
    const document = page();
    const detected = vi.fn();
    const disconnect = watchForLoginForm(document, detected);
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = '<form><input type="email"><input type="password"></form>';
    document.body.append(dialog);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detected).toHaveBeenCalledTimes(1);
    disconnect();
  });

  it('keeps the reminder host fixed above normal document modal stacking contexts', () => {
    expect(REMINDER_HOST_LAYER_STYLE).toContain('position:fixed');
    expect(REMINDER_HOST_LAYER_STYLE).toContain('z-index:2147483647');
    expect(REMINDER_HOST_LAYER_STYLE).toContain('pointer-events:none');
  });
});
