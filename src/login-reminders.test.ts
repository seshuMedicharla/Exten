import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateReminderForSite, beginSitePermissionRequest, finishSitePermissionRequest, nextReminderKind, reminderTargetForUrl, remindersEnabledForSite, requestOptionalHostPermission, validateContentReminderMessage } from './login-reminders';

afterEach(() => vi.unstubAllGlobals());

describe('smart login reminder privacy gates', () => {
  it('builds a narrow scheme/hostname permission and keeps exact origin separately', () => {
    expect(reminderTargetForUrl('https://accounts.example.com:8443/login?token=secret')).toEqual({
      origin: 'https://accounts.example.com:8443',
      hostname: 'accounts.example.com',
      permissionPattern: 'https://accounts.example.com/*',
      registrationMatch: 'https://accounts.example.com/*',
    });
    expect(reminderTargetForUrl('chrome://settings')).toBeNull();
    expect(reminderTargetForUrl('javascript:alert(1)')).toBeNull();
  });

  it('does not activate on the site until global opt-in, exact origin access, and non-suppression all hold', () => {
    const authorized = ['https://example.com'];
    expect(remindersEnabledForSite(false, 'https://example.com', authorized, [])).toBe(false);
    expect(remindersEnabledForSite(true, 'https://sibling.example.com', authorized, [])).toBe(false);
    expect(remindersEnabledForSite(true, 'https://example.com:8443', authorized, [])).toBe(false);
    expect(remindersEnabledForSite(true, 'https://example.com', authorized, ['example.com'])).toBe(false);
    expect(remindersEnabledForSite(true, 'https://example.com', authorized, [])).toBe(true);
  });

  it('requests permission during the calling gesture and proceeds only after approval', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    const permission = beginSitePermissionRequest('https://example.com/login', ask)!;
    expect(ask).toHaveBeenCalledWith(['https://example.com/*']);
    const enable = vi.fn().mockResolvedValue(undefined);
    await expect(finishSitePermissionRequest(permission, enable)).resolves.toBe('enabled');
    expect(enable).toHaveBeenCalledWith(permission.target);

    const deny = beginSitePermissionRequest('https://denied.example/login', vi.fn().mockResolvedValue(false))!;
    const shouldNotEnable = vi.fn();
    await expect(finishSitePermissionRequest(deny, shouldNotEnable)).resolves.toBe('denied');
    expect(shouldNotEnable).not.toHaveBeenCalled();
  });

  it('rejects unsupported or malformed origins without requesting permissions', () => {
    const ask = vi.fn().mockResolvedValue(true);
    expect(beginSitePermissionRequest('chrome://settings', ask)).toBeNull();
    expect(beginSitePermissionRequest('javascript:alert(1)', ask)).toBeNull();
    expect(beginSitePermissionRequest('https://bad host.example/login', ask)).toBeNull();
    expect(ask).not.toHaveBeenCalled();
    expect(reminderTargetForUrl('https://www.kogland.com/')).toMatchObject({
      origin: 'https://www.kogland.com',
      permissionPattern: 'https://www.kogland.com/*',
    });
  });

  it('checks Chrome callback lastError and promise rejections for permission failures', async () => {
    const origins = ['https://www.kogland.com/*'];
    const request = vi.fn((_permissions, callback) => { callback(true); return Promise.resolve(true); });
    await expect(requestOptionalHostPermission(origins, request, () => undefined)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins }, expect.any(Function));
    await expect(requestOptionalHostPermission(origins, (_permissions, callback) => { callback(false); }, () => ({ message: 'permission API failed' }))).rejects.toThrow('permission API failed');
    await expect(requestOptionalHostPermission(origins, () => Promise.reject(new Error('gesture required')), () => undefined)).rejects.toThrow('gesture required');
  });

  it('runs registration and injection only after permission grant and reports activation errors', async () => {
    const registerContentScripts = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      scripting: { getRegisteredContentScripts: vi.fn().mockResolvedValue([]), registerContentScripts },
      storage: { local: { get: vi.fn().mockResolvedValue({ preferences: { smartPasswordHintReminders: true }, loginReminderOrigins: [] }), set: vi.fn().mockResolvedValue(undefined) } },
    });
    const target = reminderTargetForUrl('https://www.kogland.com/')!;
    const getTab = vi.fn().mockResolvedValue({ url: 'https://www.kogland.com/' });
    const inject = vi.fn().mockResolvedValue([]);
    const granted = beginSitePermissionRequest(target.origin, async () => true)!;
    await expect(finishSitePermissionRequest(granted, async (site) => { await activateReminderForSite(site, 17, getTab, inject); })).resolves.toBe('enabled');
    expect(getTab).toHaveBeenCalledWith(17);
    expect(inject).toHaveBeenCalledWith(17);
    expect(registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({ matches: ['https://www.kogland.com/*'], js: ['login-content.js'], allFrames: false })]);

    const denied = beginSitePermissionRequest(target.origin, async () => false)!;
    getTab.mockClear(); inject.mockClear();
    await expect(finishSitePermissionRequest(denied, async (site) => { await activateReminderForSite(site, 17, getTab, inject); })).resolves.toBe('denied');
    expect(getTab).not.toHaveBeenCalled();
    expect(inject).not.toHaveBeenCalled();

    const failInjection = beginSitePermissionRequest(target.origin, async () => true)!;
    inject.mockRejectedValueOnce(new Error('Cannot access contents of URL'));
    await expect(finishSitePermissionRequest(failInjection, async (site) => { await activateReminderForSite(site, 17, getTab, inject); })).rejects.toMatchObject({ stage: 'activation', message: 'Cannot access contents of URL' });
  });

  it('does not register a content script unless the optional host permission is present', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    const getRegisteredContentScripts = vi.fn().mockResolvedValue([]);
    const registerContentScripts = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      permissions: { contains },
      scripting: { getRegisteredContentScripts, registerContentScripts },
      storage: { local: { get: vi.fn().mockResolvedValue({ preferences: { smartPasswordHintReminders: true }, loginReminderOrigins: [] }), set: vi.fn().mockResolvedValue(undefined) } },
    });
    const { registerReminderOrigin } = await import('./login-reminders');
    const target = reminderTargetForUrl('https://www.kogland.com/')!;
    await expect(registerReminderOrigin(target)).rejects.toThrow('permission is no longer granted');
    expect(contains).toHaveBeenCalledWith({ origins: ['https://www.kogland.com/*'] });
    expect(getRegisteredContentScripts).not.toHaveBeenCalled();
    expect(registerContentScripts).not.toHaveBeenCalled();
  });

  it('labels the first detected visit separately from later visits without consulting the vault', () => {
    const first = nextReminderKind('example.com', []);
    expect(first).toEqual({ kind: 'first', visitedHosts: ['example.com'] });
    expect(nextReminderKind('example.com', first.visitedHosts)).toEqual({ kind: 'returning', visitedHosts: ['example.com'] });
  });

  it('rejects malicious, mismatched, cross-frame, and extra-field messages', () => {
    const sender = { id: 'extension-id', frameId: 0, tab: { id: 8 }, url: 'https://example.com/login' };
    const valid = { type: 'LOGIN_FORM_DETECTED', origin: 'https://example.com' };
    expect(validateContentReminderMessage(valid, sender, 'extension-id')).toEqual(valid);
    expect(validateContentReminderMessage(valid, { ...sender, id: 'attacker-extension' }, 'extension-id')).toBeNull();
    expect(validateContentReminderMessage(valid, { ...sender, frameId: 2 }, 'extension-id')).toBeNull();
    expect(validateContentReminderMessage(valid, { ...sender, tab: { id: -1 } }, 'extension-id')).toBeNull();
    expect(validateContentReminderMessage({ ...valid, origin: 'https://example.com.evil.test' }, sender, 'extension-id')).toBeNull();
    expect(validateContentReminderMessage({ ...valid, url: 'javascript:alert(1)' }, sender, 'extension-id')).toBeNull();
    expect(validateContentReminderMessage({ ...valid, hint: 'plaintext secret' }, sender, 'extension-id')).toBeNull();
  });
});
