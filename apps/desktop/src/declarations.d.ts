/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
declare module '*.png' {
  const source: string;
  export default source;
}

interface Window {
  vyora: import('@vyora/shared').DesktopApi;
}
