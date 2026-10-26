import { useEffect, useState } from 'react';
import { loadPreferences } from './preferences';
import { DEFAULT_PREFERENCES, type Preferences } from './types';

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  useEffect(() => { let active = true; void loadPreferences().then((value) => { if (active) setPreferences(value); }).catch(() => {}); return () => { active = false; }; }, []);
  return preferences;
}
