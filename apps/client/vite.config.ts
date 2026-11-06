import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const installerUrl = '/downloads/VYORA-0.1.0-Setup.exe';
const installerPath = fileURLToPath(new URL(`./public${installerUrl}`, import.meta.url));

export default defineConfig({
  define: {
    'import.meta.env.VITE_WINDOWS_INSTALLER_URL': JSON.stringify(
      existsSync(installerPath) ? installerUrl : '',
    ),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
