import type { ForgeConfig } from '@electron-forge/shared-types';
import MakerNsis from 'electron-forge-maker-nsis';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NOTICE_REVISION, usageNotices } from './src/usage-notice';

const applicationIcon = path.resolve(import.meta.dirname, 'assets/vyora.ico');
const installerAssets = path.resolve(
  import.meta.dirname,
  'out/installer-assets',
);

const config: ForgeConfig = {
  packagerConfig: {
    name: 'VYORA',
    asar: true,
    executableName: 'VYORA',
    icon: applicationIcon,
    extraResource: [
      applicationIcon,
      path.resolve(import.meta.dirname, 'assets/free-frames'),
    ],
  },
  rebuildConfig: {},
  hooks: {
    generateAssets: async () => {
      mkdirSync(installerAssets, { recursive: true });
      const text = [
        'VYORA — Testing terms, privacy & testing notice',
        `Notice revision: ${NOTICE_REVISION}`,
        'Read these notices before installing this testing build.',
        ...usageNotices.flatMap((section) => [
          section.title.toUpperCase(),
          ...section.paragraphs,
        ]),
        'Choose I Agree to accept the testing terms and acknowledge these notices. Choose Cancel if you do not agree.',
      ].join('\r\n\r\n');
      writeFileSync(
        path.join(installerAssets, 'testing-notice.txt'),
        `\uFEFF${text}`,
        'utf8',
      );
    },
  },
  makers: [
    new MakerNsis({
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      installerLanguages: ['en_US'],
      displayLanguageSelector: false,
      license: path.join(installerAssets, 'testing-notice.txt'),
      include: path.resolve(import.meta.dirname, 'installer/vyora.nsh'),
      installerIcon: applicationIcon,
      uninstallerIcon: applicationIcon,
      installerSidebar: path.join(installerAssets, 'sidebar.bmp'),
      uninstallerSidebar: path.join(installerAssets, 'sidebar.bmp'),
      installerHeader: path.join(installerAssets, 'header.bmp'),
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'VYORA',
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
      artifactName: 'VYORA-${version}-Setup.${ext}',
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
