import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGlobalSettings } from '../services/settingsService';
import { resolveSeason, Season, SeasonalThemeSetting } from '../constants/seasons';

// Per-device, so turning it off needs no Firestore write.
const OPT_OUT_KEY = 'seasonalThemeOptOut';

interface SeasonContextValue {
  /** The season being shown right now, or null. */
  season: Season | null;
  /** The season the admin setting/calendar selects, ignoring this user's opt-out. */
  availableSeason: Season | null;
  setting: SeasonalThemeSetting;
  optedOut: boolean;
  setOptedOut: (optedOut: boolean) => void;
  /** Re-reads the admin setting, e.g. after an admin changes it. */
  refresh: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextValue>({
  season: null,
  availableSeason: null,
  setting: 'auto',
  optedOut: false,
  setOptedOut: () => {},
  refresh: async () => {},
});

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [setting, setSetting] = useState<SeasonalThemeSetting>('auto');
  const [optedOut, setOptedOutState] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const settings = await getGlobalSettings();
      setSetting(settings.seasonalTheme ?? 'auto');
    } catch {
      // Keep the calendar default if settings can't be read
    }
  }, []);

  useEffect(() => {
    refresh();
    AsyncStorage.getItem(OPT_OUT_KEY)
      .then(value => setOptedOutState(value === 'true'))
      .catch(() => {});
  }, [refresh]);

  const setOptedOut = useCallback((value: boolean) => {
    setOptedOutState(value);
    AsyncStorage.setItem(OPT_OUT_KEY, String(value)).catch(() => {});
  }, []);

  const availableSeason = resolveSeason(setting);
  const season = optedOut ? null : availableSeason;

  return (
    <SeasonContext.Provider value={{ season, availableSeason, setting, optedOut, setOptedOut, refresh }}>
      {children}
    </SeasonContext.Provider>
  );
}

export const useSeason = () => useContext(SeasonContext);
