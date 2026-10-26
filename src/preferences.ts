import { DEFAULT_PREFERENCES, type Preferences } from './types';

const STORAGE_KEY = 'preferences';
export function sanitizePreferences(input: unknown): Preferences {
  if (typeof input !== 'object' || input === null) return { ...DEFAULT_PREFERENCES };
  const value = input as Record<string, unknown>;
  return {
    showUrlObservations: typeof value.showUrlObservations === 'boolean' ? value.showUrlObservations : DEFAULT_PREFERENCES.showUrlObservations,
    highlightHttp: typeof value.highlightHttp === 'boolean' ? value.highlightHttp : DEFAULT_PREFERENCES.highlightHttp,
    showRecommendations: typeof value.showRecommendations === 'boolean' ? value.showRecommendations : DEFAULT_PREFERENCES.showRecommendations,
  };
}
export async function loadPreferences(): Promise<Preferences> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return sanitizePreferences(data[STORAGE_KEY]);
}
export async function savePreferences(preferences: Preferences): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: sanitizePreferences(preferences) });
}
