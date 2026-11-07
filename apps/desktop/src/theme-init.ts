import { readTheme } from './theme';

// Apply appearance before the first-launch notice or Studio renders.
const theme = readTheme({ getItem: (key) => localStorage.getItem(key) });
document.documentElement.dataset.theme = theme;
void window.vyora?.setTheme?.(theme).catch(() => {
  /* The page remains themed if native chrome is unavailable. */
});
