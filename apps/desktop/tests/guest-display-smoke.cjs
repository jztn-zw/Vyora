// Two isolated windows and a local browser client. Synthetic camera, no user photos.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'out/test-guest');
const bundle = fs.existsSync(
  path.join(root, '.vite/renderer/main_window/index.html'),
)
  ? root
  : path.join(root, 'out/VYORA-win32-x64/resources/app.asar');
fs.mkdirSync(path.join(artifacts, 'profile'), { recursive: true });
app.setPath('userData', path.join(artifacts, 'profile'));
app.disableHardwareAcceleration();
const compiled = ts.transpileModule(
  fs.readFileSync(path.join(root, 'src/guest-hub.ts'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const mod = new Module(path.join(root, 'src/guest-hub.cjs'), module);
mod.filename = path.join(root, 'src/guest-hub.cjs');
mod.paths = module.paths;
mod._compile(compiled, mod.filename);
const { GuestHub } = mod.exports;
app.whenReady().then(async () => {
  let host, guest, tablet, hub;
  try {
    let strip = null,
      saved = null,
      count = 0,
      saveCount = 0,
      reply;
    const pixel = nativeImage
      .createFromBitmap(Buffer.alloc(64 * 48 * 4, 180), {
        width: 64,
        height: 48,
      })
      .toDataURL();
    const handle = (name, callback) =>
      ipcMain.handle(name, (event, value) => callback(value, event));
    hub = new GuestHub(
      path.join(bundle, '.vite/renderer/main_window'),
      (command) =>
        new Promise((resolve, reject) => {
          reply = { resolve, reject };
          host.webContents.send('guest:command', {
            ...command,
            requestId: 'isolated-command',
          });
        }),
    );
    ipcMain.on('guest:reply', (_event, value) => {
      if (value.error) reply.reject(new Error(value.error));
      else reply.resolve();
    });
    const status = () => ({
      ...hub.status(),
      displayId: guest ? 2 : null,
      displays: [
        { id: 1, label: 'Controller', primary: true },
        { id: 2, label: 'Guest monitor', primary: false },
      ],
    });
    handle('guest:status', status);
    handle('guest:configure', async (value) => {
      if (value.tablet === true) await hub.start();
      if (value.tablet === false) hub.stop();
      if (value.approve) hub.approve(value.approve);
      if (value.revoke) hub.revoke(value.revoke);
      return { ok: true, value: status() };
    });
    // The host methods return the same result envelope as real main-process handlers.
    ipcMain.removeHandler('guest:status');
    handle('guest:status', () => ({ ok: true, value: status() }));
    handle('guest:publish', (value) => {
      hub.publish(value);
      return { ok: true };
    });
    handle('guest:preview', (value) => {
      hub.preview = Buffer.from(value);
      return { ok: true };
    });
    handle('guest:read', () => ({ ok: true, value: hub.state() }));
    handle('guest:read-preview', () => ({
      ok: true,
      value: hub.preview.length
        ? `data:image/jpeg;base64,${hub.preview.toString('base64')}`
        : '',
    }));
    handle('guest:send', async (value) => {
      try {
        await hub.dispatch(value);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    handle('window:theme', () => ({ ok: true }));
    handle('template:list', () => ({ ok: true, value: [] }));
    handle('library:read', () => ({
      ok: true,
      value: {
        directory: artifacts,
        photos: [],
        photoCount: 0,
        stripCount: saved ? 1 : 0,
        strips: saved ? [saved] : [],
        pendingStrip: strip || undefined,
      },
    }));
    handle('printer:state', () => ({ ok: false, error: 'No fixture printer' }));
    handle('session:capture', ({ jpeg, sessionId }) => {
      count++;
      const photo = {
        id: `photo-${count}`,
        createdAt: new Date().toISOString(),
        width: 64,
        height: 48,
        thumbnail: nativeImage.createFromBuffer(Buffer.from(jpeg)).toDataURL(),
      };
      strip ||= { id: sessionId, createdAt: photo.createdAt, photos: [] };
      strip.photos.push(photo);
      return { ok: true, value: photo };
    });
    handle('session:replace', ({ photoId, jpeg }) => {
      const photo = strip.photos.find((p) => p.id === photoId);
      photo.thumbnail = nativeImage
        .createFromBuffer(Buffer.from(jpeg))
        .toDataURL();
      return { ok: true, value: photo };
    });
    handle('strip:sources', () => ({ ok: true, value: strip }));
    handle('strip:save', ({ jpeg }) => {
      saveCount++;
      saved = {
        ...strip,
        preview: nativeImage
          .createFromBuffer(Buffer.from(jpeg))
          .resize({ width: 280 })
          .toDataURL(),
      };
      strip = null;
      return { ok: true, value: 'fixture.jpg' };
    });
    handle('strip:preview', () => ({
      ok: true,
      value: saved?.preview || pixel,
    }));
    const make = (preload = true) =>
      new BrowserWindow({
        width: 1160,
        height: 860,
        show: false,
        webPreferences: {
          ...(preload
            ? { preload: path.join(bundle, '.vite/build/preload.cjs') }
            : {}),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
    host = make();
    guest = make();
    const capture = async (window, name) => {
      window.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await window.webContents.capturePage();
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.writeFileSync(
        path.join(artifacts, name),
        (await window.webContents.capturePage()).toPNG(),
      );
    };
    const run = (window, source) =>
      window.webContents.executeJavaScript(source);
    const until = async (window, source, timeout = 22000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await run(window, source)) return;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      throw new Error('Timed out: ' + source);
    };
    await host.webContents.session.clearStorageData({
      storages: ['localstorage'],
    });
    await host.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    await until(
      host,
      "!!document.querySelector('.usage-notice-consent input')",
    );
    // Match the existing explicit acceptance UI without reading personal preferences.
    await run(host, "document.querySelector('input[type=checkbox]').click()");
    await run(
      host,
      "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Accept')).click()",
    );
    await until(host, "!!document.querySelector('.topbar .guest-actions')");
    assert.equal(
      await run(host, "!!document.querySelector('#main .guest-controller')"),
      false,
      'The large workspace banner is removed',
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click()",
    );
    assert.equal(
      await run(host, "document.querySelector('.guest-actions').open"),
      true,
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
    );
    assert.equal(
      await run(host, "document.querySelector('.guest-actions').open"),
      false,
      'Escape dismisses guest actions',
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click()",
    );
    await run(
      host,
      "document.querySelector('.main-nav').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))",
    );
    assert.equal(
      await run(host, "document.querySelector('.guest-actions').open"),
      false,
      'Clicking outside dismisses guest actions',
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click()",
    );
    const bounds = await run(
      host,
      "(() => { const rect=document.querySelector('.guest-actions-menu').getBoundingClientRect();return [rect.left,rect.right,innerWidth];})()",
    );
    assert.ok(
      bounds[0] >= 0 && bounds[1] <= bounds[2],
      'Guest actions stay within the viewport',
    );
    await capture(host, 'header-guest-actions-dark.png');
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click()",
    );
    await guest.loadFile(
      path.join(bundle, '.vite/renderer/main_window/guest.html'),
    );
    await until(guest, "!!document.querySelector('.guest-camera')");
    await run(
      host,
      `(() => { const c = document.createElement('canvas'); c.width=64; c.height=48; const ctx=c.getContext('2d'); const paint=()=>{ctx.fillStyle='#497caa';ctx.fillRect(0,0,64,48)}; paint(); setInterval(paint,80); navigator.mediaDevices.enumerateDevices=async()=>[{deviceId:'guest-fixture',kind:'videoinput',label:'Fixture camera',groupId:''}];navigator.mediaDevices.getUserMedia=async()=>c.captureStream(15); })()`,
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click(); Array.from(document.querySelectorAll('.guest-actions-menu button')).find(b=>b.querySelector('strong')?.textContent==='Pause booth').click()",
    );
    await until(
      guest,
      "document.body.textContent.includes('The booth is paused.')",
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click(); Array.from(document.querySelectorAll('.guest-actions-menu button')).find(b=>b.querySelector('strong')?.textContent==='Resume booth').click()",
    );
    await until(
      guest,
      "!document.body.textContent.includes('The booth is paused.')",
    );
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click(); document.querySelector('.guest-action-setup').click()",
    );
    await until(host, "!!document.querySelector('.booth-setup')");
    assert.equal(
      await run(
        host,
        "document.querySelector('.booth-setup-footer .primary-button').textContent.includes('Start full-screen booth')",
      ),
      true,
    );
    await run(
      host,
      "document.querySelector('.booth-setup-footer .primary-button').click()",
    );
    await until(
      host,
      "!!document.querySelector('.app-shell.kiosk-mode.kiosk-stage-design')",
    );
    await until(
      guest,
      "!!document.querySelector('.kiosk-template-grid button') && !document.querySelector('.kiosk-template-grid button').disabled",
    );
    assert.equal(
      await run(guest, "!!document.querySelector('.main-nav')"),
      false,
    );
    await run(
      guest,
      "Promise.all(Array.from(document.querySelectorAll('.kiosk-template-grid img'), image => image.decode()))",
    );
    assert.equal(
      await run(
        guest,
        "Array.from(document.querySelectorAll('.kiosk-template-grid img')).every(image => image.naturalWidth > 0)",
      ),
      true,
      'Standalone frame images must decode',
    );
    await capture(guest, 'guest-frame-chooser.png');
    await run(
      guest,
      "document.querySelector('.kiosk-template-grid button').click()",
    );
    await until(
      guest,
      "!!document.querySelector('.kiosk-start-surface') && !document.querySelector('.kiosk-start-surface').disabled",
    );
    await until(guest, "!!document.querySelector('.guest-live')");
    assert.equal(
      await run(
        guest,
        "(() => { const box=document.querySelector('.guest-camera').getBoundingClientRect(); return box.top===0 && box.left===0 && Math.abs(box.width-innerWidth)<2 && Math.abs(box.height-innerHeight)<2; })()",
      ),
      true,
      'Guest camera fills the viewport',
    );
    assert.equal(
      await run(guest, "!!document.querySelector('.guest-header')"),
      false,
    );
    await until(host, "!!document.querySelector('.kiosk-stage-capture')");
    await capture(guest, 'guest-camera-fullscreen.png');
    await run(guest, "document.querySelector('.kiosk-back-button').click()");
    await until(guest, "!!document.querySelector('.kiosk-template-grid')");
    await until(host, "!!document.querySelector('.kiosk-stage-design')");
    await run(
      guest,
      "document.querySelector('.kiosk-template-grid button').click()",
    );
    await until(
      guest,
      "!!document.querySelector('.kiosk-start-surface') && !document.querySelector('.kiosk-start-surface').disabled",
    );
    await run(guest, "document.querySelector('.kiosk-start-surface').click()");
    await until(guest, "!!document.querySelector('.guest-review')", 35000);
    assert.equal(count, 4);
    await run(
      guest,
      "document.querySelector('.capture-review-effects button:nth-child(2)').click()",
    );
    await until(
      guest,
      "document.querySelector('.capture-review-effects button:nth-child(2)').getAttribute('aria-pressed') === 'true'",
    );
    await until(
      host,
      "document.querySelector('.capture-review-effects button:nth-child(2)').getAttribute('aria-pressed') === 'true'",
    );
    await capture(guest, 'guest-review.png');
    await run(
      guest,
      "document.querySelector('.guest-retake-grid button').click()",
    );
    await run(
      guest,
      "document.querySelector('.guest-buttons .outline-button').click()",
    );
    await until(
      guest,
      "!!document.querySelector('.remote-booth.kiosk-stage-capture')",
    );
    await until(
      guest,
      "!!document.querySelector('.guest-review') && !document.querySelector('.guest-buttons .primary-button').disabled",
    );
    await run(
      guest,
      "document.querySelector('.guest-buttons .primary-button').click()",
    );
    await until(
      guest,
      "document.body.textContent.includes('Your strip is ready.')",
    );
    assert.equal(saveCount, 1);
    const savedImage = nativeImage.createFromDataURL(saved.preview);
    const bitmap = savedImage.toBitmap();
    const offset = (70 * savedImage.getSize().width + 120) * 4;
    const channels = Array.from(bitmap.subarray(offset, offset + 3));
    assert.ok(
      Math.max(...channels) - Math.min(...channels) <= 3,
      'Selected monochrome effect is baked into the saved JPEG after the retake',
    );

    await until(host, "!document.querySelector('.capture-review[open]')");
    for (const theme of ['light', 'dark', 'vyora']) {
      await run(guest, `document.documentElement.dataset.theme='${theme}'`);
      await capture(guest, `guest-done-${theme}.png`);
    }
    // Local browser transport: no preload, same app served to a tablet/Mac browser.
    await hub.start();
    const pairingUrl = hub.status().urls[0];
    assert.ok(pairingUrl);
    tablet = make(false);
    await tablet.loadURL(pairingUrl);
    await until(
      tablet,
      "!!document.querySelector('.guest-pair .primary-button')",
    );
    await run(
      tablet,
      "document.querySelector('.guest-pair .primary-button').click()",
    );
    await until(
      tablet,
      "document.body.textContent.includes('Waiting for the organizer to approve')",
    );
    const device = hub.status().devices[0];
    assert.ok(device);
    hub.approve(device.id);
    await until(
      tablet,
      "document.body.textContent.includes('Your strip is ready.')",
    );
    assert.equal(await run(tablet, 'typeof window.vyora'), 'undefined');
    tablet.setSize(800, 1100);
    await capture(tablet, 'tablet-portrait.png');
    await tablet.reload();
    await until(
      tablet,
      "document.body.textContent.includes('Your strip is ready.')",
    );
    hub.revoke(device.id);
    await until(
      tablet,
      "document.body.textContent.includes('Pair this device with VYORA again.')",
    );
    assert.equal(
      await run(tablet, "!!document.querySelector('.guest-review')"),
      false,
    );
    await run(
      guest,
      "document.querySelector('.guest-done .primary-button').click()",
    );
    await until(guest, "!!document.querySelector('.kiosk-template-grid')");
    await run(host, "document.querySelector('.kiosk-exit-button').click()");
    await until(host, "!!document.querySelector('.exit-booth-dialog[open]')");
    await run(
      host,
      "document.querySelector('.exit-booth-dialog .primary-button').click()",
    );
    await until(host, "!document.querySelector('.app-shell.kiosk-mode')");
    await until(
      guest,
      "!!document.querySelector('.remote-booth.kiosk-stage-capture') && !document.querySelector('.kiosk-start-surface') && !document.querySelector('.kiosk-template-grid')",
    );
    assert.equal(
      await run(guest, "!!document.querySelector('.kiosk-template-grid')"),
      false,
      'Assisted mode is view-only',
    );
    // Saving in assisted mode must return guests to the camera automatically.
    await run(
      host,
      "document.querySelector('.camera-connect .primary-button').click()",
    );
    await until(
      host,
      "!!document.querySelector('.capture-button') && !document.querySelector('.capture-button').disabled",
    );
    await run(host, "document.querySelector('.capture-button').click()");
    await until(
      host,
      "!!document.querySelector('.capture-review[open]')",
      35000,
    );
    await until(guest, "!!document.querySelector('.guest-review')");
    await run(
      host,
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until(
      guest,
      "!!document.querySelector('.guest-live') && document.body.textContent.includes('Get ready for your photos.') && !document.querySelector('.guest-done') && !document.querySelector('.guest-review')",
    );
    assert.equal(saveCount, 2, 'Assisted confirmation saves exactly once');
    assert.equal(
      await run(guest, "!!document.querySelector('.kiosk-start-surface')"),
      false,
      'Ready assisted preview remains view-only',
    );
    assert.equal(
      await run(host, "!!document.querySelector('.strip-viewer[open]')"),
      false,
      'Operator stays in Studio',
    );
    await capture(guest, 'guest-assisted-ready-after-save.png');
    await run(
      host,
      "document.querySelector('.guest-actions > summary').click(); document.querySelector('.guest-action-displays').click()",
    );
    await until(host, "!!document.querySelector('.guest-manager[open]')");
    await capture(host, 'controller-connections.png');
    await tablet.setSize(800, 1100);
    console.log(
      'PASS: separate controller and guest window, self-service capture, retake, single save, next group, browser pairing/approval/reload/revocation, and assisted mode.',
    );
    console.log('Artifacts: ' + artifacts);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    hub?.dispose();
    for (const window of [host, guest, tablet])
      if (window && !window.isDestroyed()) window.destroy();
    app.exit(process.exitCode || 0);
  }
});
