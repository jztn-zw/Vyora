import { readTheme } from './theme';

// Run before React mounts so the saved theme also styles the first frame.
document.documentElement.dataset.theme = readTheme(
  { getItem: (key) => localStorage.getItem(key) },
  matchMedia('(prefers-color-scheme: dark)').matches,
);
