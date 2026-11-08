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
    let autoEnabled = false,
      printerConnected = true,
      selectedPrinter = 'Microsoft Print to PDF',
      autoJob = null,
      printCount = 0;
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
    let previewFrames = 0;
    handle('guest:preview', (value) => {
      previewFrames++;
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
    const printerState = () => ({
      devices: [
        {
          name: 'Microsoft Print to PDF',
          displayName: 'Microsoft Print to PDF',
          virtual: true,
          readiness: 'unavailable',
        },
        {
          name: 'Fixture photo printer',
          displayName: 'Fixture photo printer',
          readiness: printerConnected ? 'ready' : 'unavailable',
          statusMessage: printerConnected
            ? 'Windows reports this printer ready.'
            : 'The printer is offline.',
        },
      ],
      settings: {
        deviceName: selectedPrinter,
        layout: 'double-strip',
        copies: 1,
        autoPrint: autoEnabled,
      },
      settingsIssue: '',
      busy: false,
      job: autoJob,
      autoPrint: autoJob,
    });
    handle('printer:state', () => ({ ok: true, value: printerState() }));
    handle('printer:settings', ({ deviceName }) => {
      assert.equal(deviceName, 'Fixture photo printer');
      selectedPrinter = deviceName;
      return { ok: true, value: printerState().settings };
    });
    handle('printer:activity', () => ({
      ok: true,
      value: {
        busy: ['preparing', 'submitting'].includes(autoJob?.status),
        autoPrint: autoJob,
      },
    }));
    handle('printer:auto-check', () =>
      autoEnabled && !printerConnected
        ? { ok: false, error: 'The printer is offline.' }
        : { ok: true },
    );
    handle('printer:auto-setting', (enabled) => {
      assert.ok(printerConnected || !enabled);
      autoEnabled = enabled;
      return { ok: true, value: printerState() };
    });
    handle('printer:auto-release', ({ id, checked }) => {
      assert.equal(id, autoJob.stripId);
      assert.ok(autoJob.status === 'submitted' || checked);
      autoJob = null;
      return { ok: true };
    });
    handle('printer:auto-retry', (id) => {
      assert.equal(id, autoJob.stripId);
      assert.equal(autoJob.status, 'failed');
      if (!printerConnected)
        return { ok: false, error: 'The printer is offline.' };
      autoJob = {
        ...autoJob,
        id: `print-${++printCount}`,
        status: 'submitting',
      };
      return { ok: true, value: autoJob };
    });
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
      const index = strip.photos.indexOf(photo);
      if (strip.photoCrops)
        strip.photoCrops[index] = { x: 0.5, y: 0.5, zoom: 1 };
      return { ok: true, value: photo };
    });
    handle('strip:sources', () => ({ ok: true, value: strip }));
    handle('session:crop', ({ id, areaIndex, crop }) => {
      assert.equal(id, strip.id);
      strip.photoCrops ||= Array.from({ length: 4 }, () => ({
        x: 0.5,
        y: 0.5,
        zoom: 1,
      }));
      strip.photoCrops[areaIndex] = crop;
      return { ok: true, value: structuredClone(strip) };
    });
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
      if (autoEnabled)
        autoJob = {
          id: `print-${++printCount}`,
          stripId: saved.id,
          status: 'submitting',
          message: 'Sending to printer…',
          printerName: 'Fixture photo printer',
          sheets: 1,
          stripsPerSheet: 2,
        };
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
      "document.querySelector('.guest-actions > summary').click(); Array.from(document.querySelectorAll('.guest-actions-menu button')).find(button => button.querySelector('strong')?.textContent === 'Start guest booth').click()",
    );
    await until(host, "!!document.querySelector('.booth-setup')");
    await until(
      host,
      "document.querySelector('.auto-print-status')?.textContent.includes('Microsoft Print to PDF')",
    );
    assert.equal(
      await run(host, "!!document.querySelector('.auto-print-toggle input')"),
      false,
    );
    await run(
      host,
      "document.querySelector('.booth-session-settings').scrollIntoView({ block: 'center' })",
    );
    await capture(host, 'auto-print-printer-required.png');
    await run(
      host,
      "document.querySelector('.auto-print-setting-actions .outline-button').click()",
    );
    await until(
      host,
      "!!document.querySelector('.printer-dialog[open] .studio-select-trigger:not(:disabled)')",
    );
    await run(
      host,
      "document.querySelector('.printer-dialog .studio-select-trigger').click()",
    );
    await run(
      host,
      "Array.from(document.querySelectorAll('.printer-dialog [role=option]')).find(option => option.textContent.includes('Fixture photo printer')).click()",
    );
    await run(host, "document.querySelector('.printer-footer button').click()");
    assert.equal(
      await run(
        host,
        "document.querySelector('.booth-setup-footer .primary-button').textContent.includes('Start full-screen booth')",
      ),
      true,
    );
    await until(
      host,
      "!!document.querySelector('.auto-print-toggle input:not(:disabled)')",
    );
    await run(
      host,
      "document.querySelector('.auto-print-toggle input').click()",
    );
    await until(
      host,
      "document.querySelector('.auto-print-toggle input').checked && !document.querySelector('.auto-print-toggle input').disabled",
    );
    assert.equal(autoEnabled, true);
    await run(
      host,
      "document.querySelector('.booth-live-frame-toggle input').click()",
    );
    await run(
      host,
      "document.querySelector('.booth-session-settings').scrollIntoView({ block: 'center' })",
    );
    await capture(host, 'auto-print-setting.png');
    assert.equal(
      await run(
        host,
        "getComputedStyle(document.querySelector('.auto-print-toggle input')).opacity",
      ),
      '0',
      'The native checkbox stays hidden behind the themed switch',
    );
    if (process.env.VYORA_TEST_PRINT_SETTINGS_ONLY === '1') {
      console.log(
        'PASS: auto-print setup, saved selection, and themed switch layout',
      );
      return;
    }
    printerConnected = false;
    await run(
      host,
      "document.querySelector('.booth-setup-footer .primary-button').click()",
    );
    await until(
      host,
      "document.body.textContent.includes('The printer is offline.')",
    );
    assert.equal(
      await run(host, "!!document.querySelector('.booth-setup')"),
      true,
      'Offline printer prevents opening an auto-print booth',
    );
    printerConnected = true;
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
    await until(
      guest,
      "!!document.querySelector('.kiosk-template-grid button:not(:disabled)')",
    );
    await run(
      guest,
      "document.querySelector('.kiosk-template-grid button').click()",
    );
    await until(
      guest,
      "!!document.querySelector('.kiosk-start-surface') && !document.querySelector('.kiosk-start-surface').disabled",
    );
    await run(guest, "document.querySelector('.kiosk-start-surface').click()");
    await until(
      guest,
      "document.querySelector('.live-frame-preview [role=status]')?.textContent === '1 of 4 photos'",
    );
    await run(
      guest,
      "document.querySelector('.live-frame-preview img').decode()",
    );
    await capture(guest, 'guest-live-frame.png');
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
    const framesAtReview = previewFrames;
    await run(
      guest,
      "document.querySelector('.photo-positioner > button').click()",
    );
    await until(guest, "!!document.querySelector('.photo-positioner-canvas')");
    assert.equal(
      previewFrames,
      framesAtReview,
      'Camera encoding pauses during guest review',
    );
    await run(
      guest,
      `(() => {
      const input = document.querySelector('[aria-label="Photo zoom"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    );
    await until(
      guest,
      "document.querySelector('.photo-positioner-zoom output').textContent === '1.50×'",
    );
    await run(
      guest,
      "document.querySelector('.photo-positioner-actions .primary-button').click()",
    );
    await until(guest, "!document.querySelector('.photo-positioner-canvas')");
    assert.equal(
      strip.photoCrops[0].zoom,
      1.5,
      'Guest positioning updates the host session',
    );
    await until(
      host,
      "decodeURIComponent(document.querySelector('.capture-review-preview img').src).includes('width=\"900\"')",
    );
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
      "!!document.querySelector('.auto-print-screen[aria-busy=true]')",
    );
    assert.equal(saveCount, 1);
    assert.equal(printCount, 1);
    assert.equal(
      await run(guest, "!!document.querySelector('.auto-print-card > button')"),
      false,
      'No next customer while submitting',
    );
    await capture(guest, 'auto-print-loading.png');
    printerConnected = false;
    autoJob.status = 'failed';
    autoJob.message = 'The printer is offline.';
    await until(
      host,
      "document.querySelector('#auto-print-title')?.textContent.includes('needs a hand')",
    );
    await until(
      guest,
      "document.querySelector('#auto-print-title')?.textContent.includes('needs a hand')",
    );
    assert.equal(
      await run(guest, "!!document.querySelector('.auto-print-recovery')"),
      false,
      'Guests cannot retry or skip failed prints',
    );
    await run(
      host,
      "document.querySelector('.auto-print-recovery .primary-button').click()",
    );
    await until(
      host,
      "!!document.querySelector('.auto-print-card [role=alert]')",
    );
    assert.equal(printCount, 1, 'Offline retry cannot submit');
    printerConnected = true;
    await run(
      host,
      "document.querySelector('.auto-print-recovery .primary-button').click()",
    );
    await until(
      host,
      "!!document.querySelector('.auto-print-screen[aria-busy=true]')",
    );
    assert.equal(
      printCount,
      2,
      'Only explicit operator retry submits another job',
    );
    autoJob.status = 'submitted';
    await until(
      guest,
      "document.querySelector('#auto-print-title')?.textContent === 'Sent to the printer.' && !!document.querySelector('.auto-print-card > button:not(:disabled)')",
    );
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
      "document.body.textContent.includes('Sent to the printer.')",
    );
    assert.equal(await run(tablet, 'typeof window.vyora'), 'undefined');
    tablet.setSize(800, 1100);
    await capture(tablet, 'tablet-portrait.png');
    await tablet.reload();
    await until(
      tablet,
      "document.body.textContent.includes('Sent to the printer.')",
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
      "document.querySelector('.auto-print-card > .primary-button').click()",
    );
    await until(guest, "!!document.querySelector('.kiosk-template-grid')");
    assert.equal(autoJob, null);
    autoEnabled = false;
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
      "document.querySelector('.studio-tools > summary').click(); Array.from(document.querySelectorAll('.studio-tools-menu button')).find(button => button.querySelector('strong')?.textContent === 'Guest displays').click()",
    );
    await until(host, "!!document.querySelector('.guest-manager[open]')");
    await capture(host, 'controller-connections.png');
    await tablet.setSize(800, 1100);
    console.log(
      'PASS: separate controller and guest window, self-service capture, retake, single save, next group, browser pairing/approval/reload/revocation, and assisted mode.',
    );
    console.log('Artifacts: ' + artifacts);
  } catch (error) {
    for (const [name, window] of [
      ['host', host],
      ['guest', guest],
    ])
      if (window && !window.isDestroyed()) {
        console.error(
          name,
          await window.webContents
            .executeJavaScript(
              "({ text: document.body.innerText.slice(-2500), disabled: Array.from(document.querySelectorAll('button:disabled'), button => button.textContent) })",
            )
            .catch(() => 'unavailable'),
        );
        fs.writeFileSync(
          path.join(artifacts, `failure-${name}.png`),
          (await window.webContents.capturePage()).toPNG(),
        );
      }
    console.error(error);
    process.exitCode = 1;
  } finally {
    hub?.dispose();
    for (const window of [host, guest, tablet])
      if (window && !window.isDestroyed()) window.destroy();
    app.exit(process.exitCode || 0);
  }
});
