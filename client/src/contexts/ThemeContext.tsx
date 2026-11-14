import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import type { ThemePreference, User } from '../types';

type ThemeValue = { preference: ThemePreference; setPreference: (preference: ThemePreference) => void; cycle: () => void };
const ThemeContext = createContext<ThemeValue | null>(null);
const key = 'showgraphy-theme';
export const themeOptions = [
  { value: 'light', label: 'Clear light' },
  { value: 'ocean-light', label: 'Ocean daylight' },
  { value: 'sage-light', label: 'Sage paper' },
  { value: 'rose-light', label: 'Rose paper' },
  { value: 'sunset-light', label: 'Warm sand' },
  { value: 'dark', label: 'Midnight orchid' },
  { value: 'ocean', label: 'Slate and sea' },
  { value: 'forest', label: 'Slate and moss' },
  { value: 'rose', label: 'Slate and rose' },
  { value: 'sunset', label: 'Slate and amber' },
  { value: 'system', label: 'Follow system' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export const themeGroups = [
  { label: 'Light', options: themeOptions.filter(({ value }) => value.endsWith('-light') || value === 'light') },
  { label: 'Dark', options: themeOptions.filter(({ value }) => !value.endsWith('-light') && value !== 'light' && value !== 'system') },
  { label: 'System', options: themeOptions.filter(({ value }) => value === 'system') },
] as const;

function resolveTheme(preference: ThemePreference) {
  if (preference !== 'system') return preference;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [preference, setValue] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(key);
    return themeOptions.find((option) => option.value === stored)?.value ?? 'dark';
  });

  useEffect(() => {
    if (user?.themePreference) {
      setValue(user.themePreference);
      localStorage.setItem(key, user.themePreference);
    }
  }, [user?.id]);

  useEffect(() => {
    const apply = () => document.documentElement.dataset.theme = resolveTheme(preference);
    apply();
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setValue(next);
    localStorage.setItem(key, next);
    if (user) {
      apiRequest<{ user: User }>('/users/me', { method: 'PATCH', body: JSON.stringify({ themePreference: next }) })
        .then((result) => updateUser(result.user)).catch(() => undefined);
    }
  }, [user, updateUser]);
  const cycle = useCallback(() => {
    const current = themeOptions.findIndex((option) => option.value === preference);
    setPreference(themeOptions[(current + 1) % themeOptions.length]!.value);
  }, [preference, setPreference]);
  const value = useMemo(() => ({ preference, setPreference, cycle }), [preference, setPreference, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be inside ThemeProvider.');
  return value;
}
