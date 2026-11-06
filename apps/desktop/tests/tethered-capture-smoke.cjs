// Runs the real renderer and preload against an isolated camera connector fixture.
// No webcam, native camera, flash, printer or user library is accessed.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const bundle = existsSync(
  path.join(root, '.vite/renderer/main_window/index.html'),
)
  ? root
  : path.join(root, 'out/VYORA-win32-x64/resources/app.asar');
const artifacts = path.join(root, 'out/test-tethered');
mkdirSync(path.join(artifacts, 'profile'), { recursive: true });
app.setPath('userData', path.join(artifacts, 'profile'));
app.disableHardwareAcceleration();
function image(width, height, native) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set(
        [70, native ? (x < width / 2 ? 35 : 160) : 25, 170, 255],
        (y * width + x) * 4,
      );
  return nativeImage.createFromBitmap(pixels, { width, height }).toJPEG(95);
}
const bytes = (buffer) => Uint8Array.from(buffer).buffer;
app.whenReady().then(async () => {
  let window;
  try {
    let pending,
      saved,
      shutters = 0,
      replacements = 0,
      fail = false;
    const ids = new Set();
    const handle = (name, action) =>
      ipcMain.handle(name, (_event, input) => action(input));
    handle('window:theme', () => ({ ok: true }));
    handle('guest:status', () => ({
      ok: true,
      value: {
        displays: [],
        displayId: null,
        tablet: false,
        urls: [],
        pairingCode: '',
        devices: [],
      },
    }));
    handle('template:list', () => ({ ok: true, value: [] }));
    handle('printer:state', () => ({ ok: false, error: 'No test printer' }));
    handle('printer:activity', () => ({ ok: false, error: 'No test printer' }));
    handle('strip:preview', () => ({ ok: true, value: saved?.preview || '' }));
    handle('library:read', () => ({
      ok: true,
      value: {
        directory: artifacts,
        photoCount: 0,
        photos: [],
        stripCount: saved ? 1 : 0,
        strips: saved ? [saved] : [],
        pendingStrip: pending,
      },
    }));
    handle('camera:tethered-connect', (port) => {
      assert.equal(port, 5513);
      return {
        ok: true,
        value: { serial: 'native-fixture', name: 'Tethered fixture camera' },
      };
    });
    handle('camera:tethered-preview', (port) => {
      assert.equal(port, 5513);
      return { ok: true, value: bytes(image(64, 48, false)) };
    });
    handle('camera:tethered-capture', (input) => {
      assert.equal(input.port, 5513);
      assert.equal(input.serial, 'native-fixture');
      assert.equal(input.recoveryMs, 2000);
      assert.ok(!ids.has(input.requestId));
      ids.add(input.requestId);
      shutters++;
      return fail || shutters === 3
        ? {
            ok: false,
            error:
              'Fixture shutter transfer interrupted. Check the camera before reconnecting.',
          }
        : { ok: true, value: bytes(image(320, 240, true)) };
    });
    function photo(jpeg) {
      const result = nativeImage.createFromBuffer(Buffer.from(jpeg));
      assert.deepEqual(
        result.getSize(),
        { width: 320, height: 240 },
        'Capture uses native dimensions, not the 64×48 live preview',
      );
      const pixels = result.toBitmap();
      assert.ok(
        pixels[(120 * 320 + 40) * 4 + 1] > 140,
        'Mirror is applied to native still pixels',
      );
      assert.ok(pixels[(120 * 320 + 280) * 4 + 1] < 55);
      return {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        width: 320,
        height: 240,
        thumbnail: result.toDataURL(),
      };
    }
    handle('session:capture', (input) => {
      const captured = photo(input.jpeg);
      pending ||= {
        id: input.sessionId,
        createdAt: captured.createdAt,
        photos: [],
      };
      assert.equal(input.sessionId, pending.id);
      pending.photos.push(captured);
      return { ok: true, value: captured };
    });
    handle('session:replace', (input) => {
      assert.equal(input.sessionId, pending.id);
      const index = pending.photos.findIndex(
        (photo) => photo.id === input.photoId,
      );
      assert.ok(index >= 0);
      const captured = { ...photo(input.jpeg), id: input.photoId };
      pending.photos[index] = captured;
      replacements++;
      return { ok: true, value: captured };
    });
    handle('strip:sources', (id) => {
      assert.equal(id, pending.id);
      return { ok: true, value: pending };
    });
    handle('strip:save', (input) => {
      assert.equal(input.id, pending.id);
      const strip = nativeImage.createFromBuffer(Buffer.from(input.jpeg));
      assert.equal(strip.isEmpty(), false);
      writeFileSync(
        path.join(artifacts, 'native-strip.jpg'),
        Buffer.from(input.jpeg),
      );
      saved = { ...pending, preview: strip.resize({ width: 200 }).toDataURL() };
      pending = undefined;
      return { ok: true, value: path.join(artifacts, 'native-strip.jpg') };
    });
    window = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(bundle, '.vite/build/preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    const contents = window.webContents;
    contents.session.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    await contents.session.clearStorageData({ storages: ['localstorage'] });
    await window.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    const run = (source) => contents.executeJavaScript(source);
    async function until(source, timeout = 20000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await run(source)) return;
        await new Promise((resolve) => setTimeout(resolve, 75));
      }
      throw Error(`Renderer condition timed out: ${source}`);
    }
    await until("!!document.querySelector('.usage-notice-consent input')");
    await run("document.querySelector('.usage-notice-consent input').click()");
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await run(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.capture-equipment summary')");
    // Choose native capture using the same controls as an organizer.
    await run(
      "document.querySelector('.capture-equipment summary').click(); document.querySelector('.capture-equipment .studio-select-trigger').click()",
    );
    await until("!!document.querySelector('.capture-equipment [role=option]')");
    await run(
      "Array.from(document.querySelectorAll('.capture-equipment [role=option]')).find(el => el.textContent.includes('Tethered camera')).click()",
    );
    await until(
      '!!document.querySelector(\'.capture-equipment input[aria-label="Connector port"]\')',
    );
    assert.equal(
      await run(
        "JSON.parse(localStorage.getItem('vyora.capture-equipment')).source",
      ),
      'tethered',
    );
    await run("document.querySelector('.camera-connect button').click()");
    await until(
      "document.querySelector('.capture-button').textContent.includes('Take 4') && !document.querySelector('.capture-button').disabled",
    );
    assert.equal(
      await run("document.querySelector('.viewfinder video').videoWidth"),
      64,
    );
    contents.invalidate();
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeFileSync(
      path.join(artifacts, 'native-settings.png'),
      (await contents.capturePage()).toPNG(),
    );
    await run("document.querySelector('.capture-button').click()");
    await until("!!document.querySelector('.capture-review[open]')", 35000);
    assert.equal(shutters, 3);
    assert.equal(pending.photos.length, 2);
    const firstPhotos = pending.photos.map(({ id }) => id);
    assert.equal(
      await run(
        "document.querySelector('.capture-review-footer .primary-button').textContent.trim()",
      ),
      'Take remaining photos',
    );
    assert.equal(
      await run(
        "document.querySelector('.capture-review-footer .primary-button').disabled",
      ),
      true,
    );
    await run(
      "document.querySelector('.capture-review-camera-note button').click()",
    );
    await until(
      "!document.querySelector('.capture-review-footer .primary-button').disabled",
    );
    await run(
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until(
      "document.querySelector('.capture-review-footer .primary-button')?.textContent.includes('Confirm & save')",
    );
    assert.equal(shutters, 5);
    assert.equal(pending.photos.length, 4);
    assert.deepEqual(
      pending.photos.slice(0, 2).map(({ id }) => id),
      firstPhotos,
    );
    assert.equal(saved, undefined, 'Review must not automatically save');
    await run("document.querySelector('.capture-review-photo').click()");
    await until(
      "!document.querySelector('.capture-review-footer .outline-button').disabled",
    );
    await run(
      "document.querySelector('.capture-review-footer .outline-button').click()",
    );
    await until("!document.querySelector('.capture-review[open]')");
    await until("!!document.querySelector('.capture-review[open]')");
    assert.equal(shutters, 6);
    assert.equal(replacements, 1);
    await run(
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until("!document.querySelector('.capture-review[open]')");
    assert.ok(saved);
    assert.equal(saved.photos.length, 4);
    // A failed hardware capture must not fall back to a preview video frame.
    fail = true;
    await run("document.querySelector('.capture-button').click()");
    await until(
      "document.body.textContent.includes('Fixture shutter transfer interrupted')",
    );
    assert.equal(shutters, 7);
    assert.equal(pending, undefined);
    assert.equal(
      await run("document.querySelector('.capture-button').disabled"),
      true,
    );
    contents.invalidate();
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeFileSync(
      path.join(artifacts, 'native-camera-error.png'),
      (await contents.capturePage()).toPNG(),
    );
    console.log(
      'PASS: native preview, full-size mirrored capture, retake, confirm-only save and failure without fallback',
    );
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (window && !window.isDestroyed()) {
      console.error(
        await window.webContents
          .executeJavaScript('document.body.innerText')
          .catch(() => 'Renderer unavailable'),
      );
      window.destroy();
    }
    app.exit(1);
  }
});
