import type { AppTheme } from '@vyora/shared';

export const THEME_KEY = 'vyora.appearance';
export const themes = ['light', 'dark', 'vyora'] as const;

export function isAppTheme(value: unknown): value is AppTheme {
  return themes.some((theme) => theme === value);
}

export function readTheme(
  storage: Pick<Storage, 'getItem'>,
  systemDark: boolean,
): AppTheme {
  try {
    const saved = storage.getItem(THEME_KEY);
    if (isAppTheme(saved)) return saved;
  } catch {
    // Appearance still works when storage is unavailable.
  }
  return systemDark ? 'dark' : 'light';
}

export function saveTheme(storage: Pick<Storage, 'setItem'>, theme: AppTheme) {
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // Keep the chosen appearance for this window even if it cannot be saved.
  }
}
