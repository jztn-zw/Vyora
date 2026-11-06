import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: { input: { main: 'index.html', guest: 'guest.html' } },
  },
});
