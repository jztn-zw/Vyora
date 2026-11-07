import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
  screen,
} from 'electron';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import type { DesktopResult } from '@vyora/shared';
import { createLibrary } from './storage/library';
import { createIncludedTemplates } from './storage/included-templates';
import { createSessionBuffer } from './storage/session-buffer';
import { validateFourPhotoTemplate } from './template-layout';
import { PrinterService } from './printing/printer-service';
import { printerSettingsStore } from './printing/printer-settings';
import { PrintError } from './printing/print-layout';
import { submitPrintWindow } from './printing/print-window';
import { PaperService } from './printing/paper-service';
import { paperStateStore } from './printing/paper-store';
import { StripRemovalService } from './storage/strip-removal';
import { GuestHub } from './guest-hub';
import { DigiCamBridge } from './tethered-bridge';
import { DEFAULT_THEME } from './theme';
import type { GuestSnapshot } from '@vyora/shared';

app.setName('VYORA');
if (process.platform === 'win32')
  app.setAppUserModelId('com.squirrel.VYORA.VYORA');
if (started) app.quit();
const storageSmokeTest =
  process.argv.includes('--storage-smoke-test') && !app.isPackaged;
const ownsInstance = storageSmokeTest || app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();

// A stale development launch must never replace the user's webcam with test video.
for (const flag of [
  'use-fake-device-for-media-stream',
  'use-file-for-fake-video-capture',
  'use-fake-ui-for-media-stream',
]) {
  app.commandLine.removeSwitch(flag);
}

let mainWindow: BrowserWindow | null = null;
let guestWindow: BrowserWindow | null = null;
let guestDisplayId: number | null = null;
let guestHub: GuestHub;
const guestReplies = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
app.on('before-quit', () => {
  guestHub?.dispose();
  for (const reply of guestReplies.values()) {
    clearTimeout(reply.timeout);
    reply.reject(new Error('The organizer closed VYORA.'));
  }
  guestReplies.clear();
});
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
let library: ReturnType<typeof createLibrary> | undefined;
let printers: PrinterService | undefined;
let papers: PaperService | undefined;
const rendererFile = path.join(
  __dirname,
  `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
);
const rendererUrl =
  MAIN_WINDOW_VITE_DEV_SERVER_URL || pathToFileURL(rendererFile).href;

function trustedUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const expected = new URL(rendererUrl);
    return (
      url.origin === expected.origin &&
      url.pathname === expected.pathname &&
      !url.search
    );
  } catch {
    return false;
  }
}

const themeBackgrounds = {
  light: '#fafafa',
  dark: '#131217',
  vyora: '#f7f3fc',
};

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 740,
    backgroundColor: themeBackgrounds[DEFAULT_THEME],
    autoHideMenuBar: true,
    title: 'VYORA',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'vyora.ico')
      : path.join(app.getAppPath(), 'assets/vyora.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const contents = mainWindow.webContents;
  const controllerOffline = () => {
    guestHub?.controllerOffline();
    for (const reply of guestReplies.values()) {
      clearTimeout(reply.timeout);
      reply.reject(
        new Error(
          'The controller is reconnecting. Please wait for the organizer.',
        ),
      );
    }
    guestReplies.clear();
  };
  contents.on('render-process-gone', controllerOffline);
  contents.on('did-start-loading', controllerOffline);
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (process.platform !== 'darwin') app.quit();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!trustedUrl(url)) event.preventDefault();
  });
  contents.session.setPermissionCheckHandler(
    (wc, permission, _origin, details) =>
      wc === contents &&
      permission === 'media' &&
      trustedUrl(details.requestingUrl) &&
      details.mediaType === 'video',
  );
  contents.session.setPermissionRequestHandler(
    (wc, permission, callback, details) => {
      callback(
        wc === contents &&
          permission === 'media' &&
          trustedUrl(details.requestingUrl) &&
          'mediaTypes' in details &&
          details.mediaTypes?.length === 1 &&
          details.mediaTypes[0] === 'video',
      );
    },
  );
  await mainWindow.loadURL(rendererUrl);
}

app
  .whenReady()
  .then(async () => {
    if (!ownsInstance || started) return;
    if (storageSmokeTest) {
      try {
        const { runStorageSmoke } = await import('./storage/smoke');
        runStorageSmoke();
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
      return;
    }
    const dataDirectory = app.isPackaged
      ? app.getPath('userData')
      : path.join(app.getAppPath(), '.local-data');
    library = createLibrary(
      path.join(dataDirectory, 'library'),
      createIncludedTemplates(
        app.isPackaged
          ? path.join(process.resourcesPath, 'free-frames')
          : path.join(app.getAppPath(), 'assets/free-frames'),
      ),
    );
    const captures = createSessionBuffer();
    const tethered = new DigiCamBridge();
    const stripRemoval = new StripRemovalService({
      stripFile: (id) => library!.stripFile(id),
      paperState: () => papers!.state(),
      busy: () => {
        const activity = printers?.activity();
        return !!activity?.busy || activity?.job?.status === 'uncertain';
      },
      pending: (id) => captures.has(id),
      trash: (filename) => shell.trashItem(filename),
    });
    printers = new PrinterService(
      {
        async list() {
          if (!mainWindow || mainWindow.isDestroyed())
            throw new PrintError('Open VYORA to detect printers.');
          const devices = await mainWindow.webContents.getPrintersAsync();
          return devices.map((device) => ({
            name: device.name,
            displayName: device.displayName || device.name,
          }));
        },
        async readStrip(id) {
          stripRemoval.assertAvailable(id);
          // stripFile validates the ID against the library, never a renderer path.
          const filename = library!.stripFile(id);
          if ((await stat(filename)).size > 20 * 1024 * 1024)
            throw new PrintError('This strip is too large to print.');
          const jpeg = await readFile(filename);
          if (jpeg.length > 20 * 1024 * 1024)
            throw new PrintError('This strip is too large to print.');
          const image = nativeImage.createFromBuffer(jpeg);
          if (image.isEmpty())
            throw new PrintError('The saved strip image could not be read.');
          return {
            jpeg: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
            size: image.getSize(),
          };
        },
        submit(html, settings, signal, onSubmitting, target) {
          return submitPrintWindow(
            () => {
              const window = new BrowserWindow({
                show: false,
                width: 1200,
                height: 1800,
                autoHideMenuBar: true,
                webPreferences: {
                  nodeIntegration: false,
                  contextIsolation: true,
                  sandbox: true,
                  partition: 'vyora-printing',
                },
              });
              window.webContents.session.setPermissionRequestHandler(
                (_wc, _permission, callback) => callback(false),
              );
              window.webContents.session.setPermissionCheckHandler(() => false);
              window.webContents.session.webRequest.onBeforeRequest(
                { urls: ['http://*/*', 'https://*/*', 'file://*/*'] },
                (_details, callback) => callback({ cancel: true }),
              );
              return window;
            },
            html,
            settings,
            signal,
            onSubmitting,
            target,
          );
        },
      },
      printerSettingsStore(dataDirectory),
    );
    await printers.initialize();
    papers = new PaperService(
      paperStateStore(dataDirectory),
      printers,
      (id) => {
        stripRemoval.assertAvailable(id);
        library!.stripFile(id);
      },
    );
    await papers.initialize();
    guestHub = new GuestHub(
      path.dirname(rendererFile),
      (command) =>
        new Promise<void>((resolve, reject) => {
          if (!mainWindow || mainWindow.isDestroyed())
            return reject(new Error('The organizer is unavailable.'));
          const requestId = crypto.randomUUID();
          const timeout = setTimeout(() => {
            guestReplies.delete(requestId);
            reject(
              new Error(
                'The organizer did not respond. Check the laptop before trying again.',
              ),
            );
          }, 90000);
          guestReplies.set(requestId, { resolve, reject, timeout });
          mainWindow.webContents.send('guest:command', {
            ...command,
            requestId,
          });
        }),
    );
    ipcMain.on('guest:reply', (event, { requestId, error }) => {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== event.sender.mainFrame
      )
        return;
      const pending = guestReplies.get(requestId);
      if (!pending) return;
      guestReplies.delete(requestId);
      clearTimeout(pending.timeout);
      if (error) pending.reject(new Error(String(error).slice(0, 300)));
      else pending.resolve();
    });
    const displayStatus = () => ({
      ...guestHub.status(),
      displayId: guestDisplayId,
      displays: screen.getAllDisplays().map((display) => ({
        id: display.id,
        label: display.label || `Display ${display.id}`,
        primary: display.id === screen.getPrimaryDisplay().id,
      })),
    });
    screen.on('display-removed', (_event, display) => {
      if (display.id === guestDisplayId) guestWindow?.close();
    });

    function handle<T>(
      channel: string,
      action: (input: unknown) => T | Promise<T>,
    ) {
      ipcMain.handle(
        channel,
        async (event, input: unknown): Promise<DesktopResult<T>> => {
          if (
            event.sender !== mainWindow?.webContents ||
            !event.senderFrame ||
            event.senderFrame !== event.sender.mainFrame ||
            !trustedUrl(event.senderFrame.url)
          ) {
            return {
              ok: false,
              error: 'This window cannot access the photo library.',
            };
          }
          try {
            return { ok: true, value: await action(input) };
          } catch (error) {
            console.error(
              `[${channel}]`,
              error instanceof Error ? error.message : 'Operation failed',
            );
            return {
              ok: false,
              error:
                channel.startsWith('guest:') || channel.startsWith('camera:')
                  ? error instanceof Error
                    ? error.message
                    : 'Could not connect the guest display.'
                  : channel.startsWith('printer:') ||
                      channel.startsWith('paper:') ||
                      channel === 'strip:delete'
                    ? error instanceof PrintError
                      ? error.message
                      : channel === 'strip:delete'
                        ? 'Could not delete this strip. Refresh the library and try again.'
                        : 'Could not complete the printer operation. Check your printer and try again.'
                    : 'Could not access the photo library. Check available disk space and folder permissions.',
            };
          }
        },
      );
    }
    handle('guest:status', displayStatus);
    handle('camera:tethered-connect', async (port) => {
      if (typeof port !== 'number')
        throw new Error('Choose a valid connector port.');
      const info = await tethered.connect(port);
      await tethered.startPreview(port);
      return info;
    });
    handle('camera:tethered-preview', (port) => {
      if (typeof port !== 'number')
        throw new Error('Choose a valid connector port.');
      return tethered.preview(port);
    });
    handle('camera:tethered-capture', (input) => {
      const value = input as {
        port?: unknown;
        serial?: unknown;
        requestId?: unknown;
        recoveryMs?: unknown;
      } | null;
      if (
        !value ||
        typeof value.port !== 'number' ||
        typeof value.serial !== 'string' ||
        typeof value.requestId !== 'string' ||
        typeof value.recoveryMs !== 'number'
      )
        throw new Error('Invalid tethered capture request.');
      return tethered.capture(
        value.port,
        value.serial,
        value.requestId,
        value.recoveryMs,
      );
    });
    handle('guest:configure', async (input) => {
      const value = input as {
        displayId?: number;
        tablet?: boolean;
        approve?: string;
        revoke?: string;
        closeDisplay?: boolean;
      };
      if (!value || typeof value !== 'object')
        throw new Error('Choose a guest display.');
      if (value.tablet === true) await guestHub.start();
      if (value.tablet === false) guestHub.stop();
      if (typeof value.approve === 'string') guestHub.approve(value.approve);
      if (typeof value.revoke === 'string') guestHub.revoke(value.revoke);
      if (value.closeDisplay) guestWindow?.close();
      if (typeof value.displayId === 'number') {
        const display = screen
          .getAllDisplays()
          .find((item) => item.id === value.displayId);
        if (!display)
          throw new Error(
            'This display was disconnected. Refresh the display list.',
          );
        if (
          display.id === screen.getPrimaryDisplay().id &&
          screen.getAllDisplays().length > 1
        )
          throw new Error(
            'Choose an extended display so your controller stays visible.',
          );
        guestWindow?.close();
        guestWindow = new BrowserWindow({
          ...display.bounds,
          fullscreen: true,
          autoHideMenuBar: true,
          title: 'VYORA · Guest display',
          backgroundColor: '#131217',
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: false,
          },
        });
        guestDisplayId = display.id;
        const openedGuest = guestWindow;
        guestWindow.on('closed', () => {
          if (guestWindow === openedGuest) {
            guestWindow = null;
            guestDisplayId = null;
          }
        });
        guestWindow.webContents.setWindowOpenHandler(() => ({
          action: 'deny',
        }));
        const guestUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
          ? new URL('guest.html', MAIN_WINDOW_VITE_DEV_SERVER_URL).href
          : pathToFileURL(path.join(path.dirname(rendererFile), 'guest.html'))
              .href;
        guestWindow.webContents.on('will-navigate', (event, url) => {
          if (url !== guestUrl) event.preventDefault();
        });
        try {
          await openedGuest.loadURL(guestUrl);
        } catch {
          if (!openedGuest.isDestroyed()) openedGuest.destroy();
          throw new Error(
            'The guest window could not open. Rebuild VYORA and try again.',
          );
        }
      }
      return displayStatus();
    });
    handle('guest:publish', (input) => {
      guestHub.publish(input as GuestSnapshot);
    });
    handle('guest:preview', (input) => {
      if (!(input instanceof ArrayBuffer) || input.byteLength > 160000)
        throw new Error('Invalid preview.');
      guestHub.preview = Buffer.from(input);
    });
    for (const [channel, action] of [
      ['guest:read', () => guestHub.state()],
      [
        'guest:read-preview',
        () =>
          guestHub.preview.length
            ? `data:image/jpeg;base64,${guestHub.preview.toString('base64')}`
            : '',
      ],
      ['guest:send', (input: unknown) => guestHub.dispatch(input)],
    ] as const) {
      ipcMain.handle(channel, async (event, input) => {
        if (
          event.sender !== guestWindow?.webContents ||
          event.senderFrame !== event.sender.mainFrame
        )
          return { ok: false, error: 'This window cannot control the booth.' };
        try {
          return { ok: true, value: await action(input) };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Please try again.',
          };
        }
      });
    }
    handle('printer:state', () => printers!.state());
    handle('printer:activity', () => printers!.activity());
    handle('printer:settings', (input) => printers!.save(input));
    handle('printer:print', (input) => printers!.start(input));
    handle('paper:state', () => papers!.state());
    handle('paper:add', (input) => papers!.add(input));
    handle('paper:remove', (input) => papers!.remove(input));
    handle('paper:create', (input) => papers!.create(input));
    handle('paper:select', (input) => papers!.select(input));
    handle('paper:mark', (input) => papers!.mark(input));
    handle('paper:delete', (input) => papers!.delete(input));
    handle('paper:print', (input) => papers!.print(input));
    handle('paper:resolve', (input) => papers!.resolve(input));
    handle('window:theme', (input) => {
      if (input !== 'light' && input !== 'dark' && input !== 'vyora')
        throw new Error('Invalid appearance');
      nativeTheme.themeSource = input === 'dark' ? 'dark' : 'light';
      mainWindow?.setBackgroundColor(themeBackgrounds[input]);
    });
    handle('library:read', () => ({
      ...library!.read(),
      pendingStrip: captures.pending(),
    }));
    handle('template:list', () => library!.templates.list());
    handle('template:update', (input) => {
      const payload = input as { id?: unknown; template?: unknown } | null;
      if (!payload || typeof payload.id !== 'string')
        throw new Error('Invalid template ID.');
      if (captures.pending())
        throw new Error(
          'Finish the current capture session before editing templates.',
        );
      return library!.templates.update(
        payload.id,
        validateFourPhotoTemplate(payload.template),
      );
    });
    handle('template:remove', (input) => {
      if (typeof input !== 'string') throw new Error('Invalid template ID.');
      if (captures.pending())
        throw new Error(
          'Finish the current capture session before removing templates.',
        );
      library!.templates.remove(input);
    });
    handle('template:read', (input) => {
      if (typeof input !== 'string') throw new Error('Invalid template ID');
      return library!.templates.get(input);
    });
    handle('template:save', (input) => {
      const draft = validateFourPhotoTemplate(input);
      const image = nativeImage.createFromDataURL(draft.frame);
      if (
        image.isEmpty() ||
        image.getSize().width !== draft.width ||
        image.getSize().height !== draft.height
      )
        throw new Error('Frame dimensions do not match the uploaded image.');
      const png = image.toPNG();
      if (png.length > 10 * 1024 * 1024)
        throw new Error('Template is larger than 10 MB.');
      return library!.templates.save(
        { ...draft, frame: `data:image/png;base64,${png.toString('base64')}` },
        png,
        image.resize({ height: 240 }).toDataURL(),
      );
    });
    handle('session:capture', (input) => {
      const payload = input as {
        jpeg?: unknown;
        sessionId?: unknown;
        templateId?: unknown;
      } | null;
      if (
        !payload ||
        !(payload.jpeg instanceof ArrayBuffer) ||
        payload.jpeg.byteLength > 20 * 1024 * 1024 ||
        typeof payload.sessionId !== 'string' ||
        (payload.templateId !== undefined &&
          typeof payload.templateId !== 'string')
      )
        throw new Error('Invalid image payload');
      const jpeg = Buffer.from(payload.jpeg);
      const image = nativeImage.createFromBuffer(jpeg);
      if (image.isEmpty()) throw new Error('Image cannot be decoded');
      const size = image.getSize();
      const template =
        typeof payload.templateId === 'string'
          ? library!.templates.get(payload.templateId)
          : undefined;
      if (template && template.slots.length !== 4)
        throw new Error('Choose a frame with 4 photo areas.');
      return captures.stage(
        payload.sessionId,
        jpeg,
        size,
        image.resize({ width: 280 }).toDataURL(),
        template,
      );
    });
    handle('session:replace', (input) => {
      const payload = input as {
        jpeg?: unknown;
        sessionId?: unknown;
        photoId?: unknown;
      } | null;
      if (
        !payload ||
        !(payload.jpeg instanceof ArrayBuffer) ||
        payload.jpeg.byteLength > 20 * 1024 * 1024 ||
        typeof payload.sessionId !== 'string' ||
        typeof payload.photoId !== 'string'
      )
        throw new Error('Invalid replacement photo payload');
      const jpeg = Buffer.from(payload.jpeg);
      const image = nativeImage.createFromBuffer(jpeg);
      if (image.isEmpty()) throw new Error('Image cannot be decoded');
      return captures.replace(
        payload.sessionId,
        payload.photoId,
        jpeg,
        image.getSize(),
        image.resize({ width: 280 }).toDataURL(),
      );
    });
    handle('strip:sources', (input) => {
      if (typeof input !== 'string') throw new Error('Invalid strip ID');
      return captures.has(input)
        ? captures.read(input)
        : library!.readStrip(input, true);
    });
    handle('strip:save', (input) => {
      const payload = input as {
        id?: unknown;
        jpeg?: unknown;
        reveal?: unknown;
      } | null;
      if (
        !payload ||
        typeof payload.id !== 'string' ||
        !(payload.jpeg instanceof ArrayBuffer) ||
        payload.jpeg.byteLength > 20 * 1024 * 1024 ||
        typeof payload.reveal !== 'boolean'
      )
        throw new Error('Invalid strip payload');
      const jpeg = Buffer.from(payload.jpeg);
      const image = nativeImage.createFromBuffer(jpeg);
      const strip = captures.has(payload.id)
        ? captures.read(payload.id)
        : library!.readStrip(payload.id);
      if (captures.has(payload.id) && strip.photos.length !== 4)
        throw new Error('Finish taking all 4 photos before saving.');
      if (
        image.isEmpty() ||
        image.getSize().width !== (strip.template?.width ?? 720) ||
        image.getSize().height !==
          (strip.template?.height ??
            64 +
              strip.photos.length * 394 +
              (strip.photos.length - 1) * 36 +
              300)
      )
        throw new Error('Invalid strip image');
      const filename = library!.saveStrip(
        strip,
        jpeg,
        image.resize({ width: 280 }).toDataURL(),
      );
      captures.clear(payload.id);
      if (payload.reveal) shell.showItemInFolder(filename);
      return filename;
    });
    handle('strip:preview', async (input) => {
      if (typeof input !== 'string') throw new Error('Invalid strip ID');
      const jpeg = await readFile(library!.stripFile(input));
      if (jpeg.byteLength > 20 * 1024 * 1024)
        throw new Error('Strip is too large');
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    });
    handle('strip:delete', (input) => stripRemoval.remove(input));
    handle('strip:open', (input) => {
      if (typeof input !== 'string') throw new Error('Invalid strip ID');
      shell.showItemInFolder(library!.stripFile(input));
    });
    handle('library:open', async () => {
      const error = await shell.openPath(library!.stripDirectory);
      if (error) throw new Error(error);
    });
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  printers?.dispose();
  papers?.dispose();
  library?.close();
});
