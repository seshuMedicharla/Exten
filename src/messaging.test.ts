import { describe, expect, it, vi } from 'vitest';
import { asReportResult, isRequest } from './messaging';
import { loadPreferences, sanitizePreferences, savePreferences } from './preferences';

describe('message validation', () => {
  it('accepts only known requests with valid tab IDs', () => {
    expect(isRequest({ type: 'GET_ACTIVE_REPORT' })).toBe(true);
    expect(isRequest({ type: 'OPEN_REPORT', tabId: 12 })).toBe(true);
    expect(isRequest({ type: 'INSPECT_PAGE', tabId: 12 })).toBe(true);
    expect(isRequest({ type: 'INSPECT_PAGE', tabId: -1 })).toBe(false);
    expect(isRequest({ type: 'OPEN_REPORT', tabId: -1 })).toBe(false);
    expect(isRequest({ type: 'GET_TAB_REPORT', tabId: '12' })).toBe(false);
    expect(isRequest({ type: 'DELETE_ALL' })).toBe(false);
  });
  it('does not treat an open acknowledgement as report data', () => {
    expect(asReportResult({ status: 'opened' }).status).toBe('error');
  });
});
describe('stored preference validation', () => {
  it('uses defaults for missing or untrusted values', () => {
    expect(sanitizePreferences({ showUrlObservations: false, highlightHttp: 'no' })).toEqual({ showUrlObservations: false, highlightHttp: true, showRecommendations: true, smartPasswordHintReminders: false });
    expect(sanitizePreferences(null)).toEqual({ showUrlObservations: true, highlightHttp: true, showRecommendations: true, smartPasswordHintReminders: false });
  });
  it('loads and saves through Chrome local storage', async () => {
    const get = vi.fn().mockResolvedValue({ preferences: { showUrlObservations: false } });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
    expect(await loadPreferences()).toEqual({ showUrlObservations: false, highlightHttp: true, showRecommendations: true, smartPasswordHintReminders: false });
    await savePreferences({ showUrlObservations: false, highlightHttp: false, showRecommendations: true, smartPasswordHintReminders: false });
    expect(get).toHaveBeenCalledWith('preferences');
    expect(set).toHaveBeenCalledWith({ preferences: { showUrlObservations: false, highlightHttp: false, showRecommendations: true, smartPasswordHintReminders: false } });
    vi.unstubAllGlobals();
  });
});
