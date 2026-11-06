// Isolated renderer integration test. Uses synthetic photos, no webcam or user library.
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
const artifacts = path.join(root, 'out', 'test-review');
mkdirSync(path.join(artifacts, 'profile'), { recursive: true });
app.setPath('userData', path.join(artifacts, 'profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let window;
  try {
    const photos = [
      [110, 70, 160],
      [60, 130, 150],
      [180, 100, 110],
      [150, 130, 70],
    ].map((color) => {
      const pixels = Buffer.alloc(64 * 48 * 4);
      for (let i = 0; i < 64 * 48; i++) pixels.set([...color, 255], i * 4);
      const image = nativeImage.createFromBitmap(pixels, {
        width: 64,
        height: 48,
      });
      return {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        width: 64,
        height: 48,
        thumbnail: `data:image/jpeg;base64,${image.toJPEG(90).toString('base64')}`,
      };
    });
    const strip = { id: randomUUID(), createdAt: photos[0].createdAt, photos };
    const originals = structuredClone(photos);
    const replaced = [];
    let saved;
    let guestStrip;
    let fileMissing = false;
    let attempts = 0;
    const greenAt = (image, x, y) =>
      image.toBitmap()[(y * image.getSize().width + x) * 4 + 1];
    const assertOrientation = (image, mirrored) => {
      assert.ok(
        Math.abs(greenAt(image, 12, 24) - (mirrored ? 140 : 35)) < 20,
        `Captured left side must match mirror=${mirrored}`,
      );
      assert.ok(
        Math.abs(greenAt(image, 52, 24) - (mirrored ? 35 : 140)) < 20,
        `Captured right side must match mirror=${mirrored}`,
      );
    };
    const framePixels = Buffer.alloc(400 * 800 * 4);
    for (let y = 10; y < 40; y++) {
      for (let x = 10; x < 40; x++) {
        framePixels.set([190, 40, 200, 255], (y * 400 + x) * 4);
      }
    }
    const rotatedFrame = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Rotated capture fixture',
      width: 400,
      height: 800,
      layer: 'overlay',
      frame: nativeImage
        .createFromBitmap(framePixels, {
          width: 400,
          height: 800,
        })
        .toDataURL(),
      slots: [
        { x: 0.25, y: 0.1, width: 0.5, height: 0.2, rotation: 30 },
        { x: 0.2, y: 0.6, width: 0.6, height: 0.2, rotation: -20 },
        { x: 0.2, y: 0.37, width: 0.6, height: 0.13 },
        { x: 0.2, y: 0.87, width: 0.6, height: 0.1 },
      ],
    };
    const handle = (name, callback) =>
      ipcMain.handle(name, (_event, input) => callback(input));
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
    handle('template:list', () => ({
      ok: true,
      value: [{ ...rotatedFrame, preview: rotatedFrame.frame }],
    }));
    handle('template:read', (id) => {
      assert.equal(id, rotatedFrame.id);
      return { ok: true, value: rotatedFrame };
    });
    handle('library:read', () => ({
      ok: true,
      value: {
        directory: artifacts,
        photoCount: 0,
        photos: [],
        stripCount: saved && !fileMissing ? 1 : 0,
        strips: saved && !fileMissing ? [saved] : [],
        pendingStrip: guestStrip || (saved ? undefined : strip),
      },
    }));
    handle('strip:sources', (id) => {
      if (guestStrip?.id === id) return { ok: true, value: guestStrip };
      assert.equal(id, strip.id);
      return { ok: true, value: strip };
    });
    handle('strip:preview', () => ({
      ok: false,
      error: 'The saved strip file is missing.',
    }));
    handle('printer:state', () => ({ ok: false, error: 'No test printer' }));
    handle('strip:save', ({ id, jpeg }) => {
      assert.equal(id, guestStrip?.id || strip.id);
      assert.ok(jpeg instanceof ArrayBuffer);
      const image = nativeImage.createFromBuffer(Buffer.from(jpeg));
      assert.deepEqual(
        image.getSize(),
        guestStrip ? { width: 400, height: 800 } : { width: 720, height: 2048 },
      );
      if (guestStrip) {
        assert.deepEqual(
          guestStrip.template.slots.map((slot) => slot.rotation),
          [30, -20, undefined, undefined],
        );
        const pixels = image.toBitmap();
        const green = (x, y) => pixels[(y * 400 + x) * 4 + 1];
        assert.ok(
          Math.abs(green(306, 138) - 127) < 20,
          'Captured pixels follow the first slot’s tilted bounds',
        );
        assert.ok(
          green(110, 90) > 235,
          'The first photo is not drawn into its old upright bounds',
        );
        assert.ok(
          green(165, 140) < 85,
          'Unmirrored strip keeps the darker photo pixels on the left',
        );
        assert.ok(
          green(235, 180) > 108,
          'Unmirrored strip keeps the lighter photo pixels on the right',
        );
        const photo = (180 * 400 + 235) * 4;
        assert.ok(Math.abs(pixels[photo] - pixels[photo + 1]) <= 3);
        assert.ok(Math.abs(pixels[photo + 2] - pixels[photo + 1]) <= 3);
        const decoration = (20 * 400 + 20) * 4;
        assert.ok(
          pixels[decoration + 2] - pixels[decoration + 1] > 110,
          'The colored frame stays in color',
        );
        writeFileSync(
          path.join(artifacts, 'rotated-capture.jpg'),
          Buffer.from(jpeg),
        );
      } else {
        assert.ok(
          greenAt(image, 160, 250) > 120,
          'Mirrored strip keeps green on the left',
        );
        assert.ok(
          greenAt(image, 560, 250) < 60,
          'Mirrored strip keeps red on the right',
        );
      }
      attempts++;
      if (attempts === 1) return { ok: false, error: 'Simulated disk failure' };
      const confirmed = guestStrip || strip;
      saved = {
        ...confirmed,
        photos: confirmed.photos.map((photo) => ({ ...photo, thumbnail: '' })),
        preview: image.resize({ width: 280 }).toDataURL(),
      };
      guestStrip = undefined;
      return { ok: true, value: path.join(artifacts, 'confirmed.jpg') };
    });
    handle('session:capture', ({ sessionId, jpeg, templateId }) => {
      assert.equal(templateId, rotatedFrame.id);
      const image = nativeImage.createFromBuffer(Buffer.from(jpeg));
      assertOrientation(image, false);
      const photo = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        width: 64,
        height: 48,
        thumbnail: image.toDataURL(),
      };
      guestStrip ||= {
        id: sessionId,
        createdAt: photo.createdAt,
        photos: [],
        template: rotatedFrame,
      };
      guestStrip.photos.push(photo);
      return { ok: true, value: photo };
    });
    handle('session:replace', ({ sessionId, photoId, jpeg }) => {
      assert.equal(sessionId, strip.id);
      const index = photos.findIndex((photo) => photo.id === photoId);
      assert.ok(index >= 0);
      const image = nativeImage.createFromBuffer(Buffer.from(jpeg));
      assert.deepEqual(image.getSize(), { width: 64, height: 48 });
      assertOrientation(image, true);
      replaced.push(photoId);
      photos[index] = {
        ...photos[index],
        createdAt: new Date().toISOString(),
        thumbnail: `data:image/jpeg;base64,${image.toJPEG(90).toString('base64')}`,
      };
      return { ok: true, value: photos[index] };
    });
    window = new BrowserWindow({
      width: 1120,
      height: 820,
      show: false,
      webPreferences: {
        preload: path.join(bundle, '.vite', 'build', 'preload.cjs'),
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
      path.join(bundle, '.vite', 'renderer', 'main_window', 'index.html'),
    );
    const evaluate = (source) =>
      contents.executeJavaScript(source).catch((error) => {
        console.error('Renderer script failed:', source);
        throw error;
      });
    async function until(source, timeout = 15000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await evaluate(source)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Renderer condition timed out: ${source}`);
    }
    await until("!!document.querySelector('.usage-welcome')");
    await evaluate(
      "document.querySelector('.usage-notice-consent input').click()",
    );
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await evaluate(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.pending-strip-notice button')");
    assert.equal(attempts, 0, 'Opening an unsaved session must not auto-save');
    await evaluate(
      "document.querySelector('.pending-strip-notice button').click()",
    );
    await until("!!document.querySelector('.capture-review[open]')");
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.frame-sequence > .taken').length",
      ),
      4,
      'Recovered pending photos show every captured position',
    );
    await evaluate(
      "document.querySelectorAll('.capture-review-photo')[0].click(); document.querySelectorAll('.capture-review-photo')[2].click()",
    );
    await until(
      "document.querySelectorAll('.capture-review-photo[aria-pressed=true]').length === 2",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.capture-review-footer .primary-button').disabled",
      ),
      true,
    );
    assert.equal(attempts, 0, 'Selecting retakes must not save');
    assert.match(
      await evaluate(
        "document.querySelector('.capture-review-footer .outline-button').textContent",
      ),
      /\(2\)/,
    );
    // Mock media only in this disposable renderer. Never request a native camera.
    await evaluate(`(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const context = canvas.getContext('2d');
      const paint = () => {
        context.fillStyle = '#b42335'; context.fillRect(0, 0, 32, 48);
        context.fillStyle = '#598c75'; context.fillRect(32, 0, 32, 48);
      };
      paint();
      const stream = canvas.captureStream(10);
      setInterval(paint, 100);
      navigator.mediaDevices.enumerateDevices = async () => [{ deviceId: 'review-fixture', kind: 'videoinput', label: 'Review fixture camera', groupId: '' }];
      navigator.mediaDevices.getUserMedia = async () => stream;
      document.querySelector('.capture-review-camera-note button').click();
    })()`);
    await until(
      "!document.querySelector('.capture-review-footer .outline-button').disabled",
    );
    await evaluate(
      "Promise.all(Array.from(document.querySelectorAll('.capture-review img'), (image) => image.decode()))",
    );
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const screenshot = await contents.capturePage();
    writeFileSync(
      path.join(artifacts, 'capture-review.png'),
      screenshot.toPNG(),
    );
    const originalSize = window.getContentSize();
    window.setContentSize(740, 650);
    await until('innerWidth <= 760');
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.capture-review-photo-grid')).gridTemplateColumns.split(' ').length",
      ),
      2,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.capture-review-footer .primary-button').getBoundingClientRect().bottom < innerHeight",
      ),
      true,
    );
    window.setContentSize(...originalSize);
    await evaluate(`(() => {
      window.__captureCanvases = [];
      const create = document.createElement.bind(document);
      document.createElement = (...args) => {
        const element = create(...args);
        if (args[0] === 'canvas') window.__captureCanvases.push(element);
        return element;
      };
      window.__exportUrls = new Set();
      const createUrl = URL.createObjectURL.bind(URL);
      const revokeUrl = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = createUrl(blob);
        window.__exportUrls.add(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        window.__exportUrls.delete(url);
        revokeUrl(url);
      };
    })()`);
    await evaluate(
      "document.querySelector('.capture-review-footer .outline-button').click()",
    );
    await until("!document.querySelector('.capture-review[open]')");
    await until("!!document.querySelector('.frame-sequence > .retaking')");
    assert.equal(
      await evaluate(
        "document.querySelector('.frame-sequence > .retaking').title",
      ),
      'Photo 1: retaking',
    );
    await until("!!document.querySelector('.capture-review[open]')");
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.frame-sequence > .taken').length",
      ),
      4,
      'Retaking two photos must not unset the other captured positions',
    );
    assert.deepEqual(replaced, [originals[0].id, originals[2].id]);
    assert.deepEqual(
      await evaluate(
        'window.__captureCanvases.map(canvas => [canvas.width, canvas.height])',
      ),
      [[0, 0]],
      'A multi-shot retake reuses one canvas and releases its pixels after capture',
    );
    assert.deepEqual(photos[1], originals[1]);
    assert.deepEqual(photos[3], originals[3]);
    assert.equal(attempts, 0, 'Retakes must return to review without saving');
    await until(
      "!document.querySelector('.capture-review-footer .primary-button').disabled",
    );
    await evaluate(
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until(
      "!!document.querySelector('.capture-review-error') && !document.querySelector('.capture-review-footer .primary-button').disabled",
    );
    assert.equal(attempts, 1);
    assert.equal(
      saved,
      undefined,
      'Failed confirmation keeps the session pending',
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.capture-review-photo').length",
      ),
      4,
    );
    await evaluate(
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until(
      "!document.querySelector('.capture-review[open]') && !document.querySelector('.pending-strip-notice')",
    );
    assert.equal(attempts, 2);
    assert.equal(
      await evaluate('window.__exportUrls.size'),
      0,
      'Export releases SVG object URLs after a failed save and a successful retry',
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.frame-sequence > .taken, .frame-sequence > .retaking').length",
      ),
      0,
      'Confirming resets the sequence for the next session',
    );
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.frame-sequence > span'), (slot) => slot.textContent)",
      ),
      ['01', '02', '03', '04'],
    );
    assert.ok(saved.photos.every((photo) => photo.thumbnail === ''));
    await evaluate(
      "Array.from(document.querySelectorAll('.main-nav button')).find((button) => button.textContent.includes('My library')).click()",
    );
    await until("document.querySelectorAll('.strip-card').length === 1");
    fileMissing = true;
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await until(
      "document.querySelectorAll('.strip-card').length === 0 && document.querySelector('.nav-count').textContent === '0'",
    );
    fileMissing = false;
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await until("document.querySelectorAll('.strip-card').length === 1");
    // Handle deletion between listing a card and opening its full-size image.
    fileMissing = true;
    await evaluate("document.querySelector('.strip-card-preview').click()");
    await until(
      "!document.querySelector('.strip-viewer[open]') && document.querySelectorAll('.strip-card').length === 0",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.main-nav button')).find((button) => button.textContent.includes('Photo booth')).click()",
    );
    await until("!!document.querySelector('.guest-actions > summary')");
    await evaluate("document.querySelector('.mirror-control input').click()");
    await until(
      "!document.querySelector('.viewfinder video').classList.contains('mirrored')",
    );
    await evaluate(
      "document.querySelector('.guest-actions > summary').click(); document.querySelector('.guest-action-setup').click()",
    );
    await until("!!document.querySelector('.booth-setup')");
    await evaluate(
      "Array.from(document.querySelectorAll('.booth-frame-option')).filter(button => button.getAttribute('aria-pressed') !== 'true').forEach(button => button.click())",
    );
    await evaluate(
      "document.querySelector('.booth-setup-footer button').click()",
    );
    await until("!!document.querySelector('.kiosk-stage-design')");
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.kiosk-template-card:first-child [data-photo-placeholder]').length",
      ),
      4,
    );
    assert.deepEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('.kiosk-template-card:first-child [data-photo-placeholder] text'), item => item.textContent)",
      ),
      ['1', '2', '3', '4'],
    );
    assert.equal(
      await evaluate("!!document.querySelector('.kiosk-template-copy')"),
      false,
    );
    assert.equal(
      await evaluate("!!document.querySelector('.kiosk-welcome')"),
      false,
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.topbar .brand')).display",
      ),
      'none',
    );
    assert.equal(
      await evaluate(`(() => {
      const box = document.querySelector('.viewfinder').getBoundingClientRect();
      return Math.abs(box.width - innerWidth) < 2 && Math.abs(box.height - innerHeight) < 2 && box.top === 0 && box.left === 0;
    })()`),
      true,
      'The camera surface must fill the guest viewport',
    );
    assert.equal(
      await evaluate(`(() => {
      const box = document.querySelector('.kiosk-template-grid').getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2;
    })()`),
      true,
      'Guest frames must be centered over the camera',
    );
    await evaluate(
      "Promise.all(Array.from(document.querySelectorAll('.kiosk-template-card img'), (image) => image.decode()))",
    );
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(
      path.join(artifacts, 'kiosk-frame-chooser.png'),
      (await contents.capturePage()).toPNG(),
    );
    await evaluate(
      "document.querySelector('.kiosk-template-card:last-child').click()",
    );
    await until(
      "!!document.querySelector('.kiosk-stage-capture') && !!document.querySelector('.kiosk-start-surface')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.kiosk-start-hint strong').textContent",
      ),
      'Tap anywhere to begin',
    );
    assert.equal(
      await evaluate("document.querySelector('.kiosk-start-surface').disabled"),
      false,
    );
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(
      path.join(artifacts, 'kiosk-camera.png'),
      (await contents.capturePage()).toPNG(),
    );
    assert.equal(
      await evaluate("!!document.querySelector('.photo-effects')"),
      false,
    );
    assert.equal(
      await evaluate(`(() => {
      const rect = document.querySelector('.viewfinder').getBoundingClientRect();
      return !!document.elementFromPoint(rect.left + 30, rect.top + rect.height * 0.4)?.closest('.kiosk-start-surface');
    })()`),
      true,
      'The open camera preview is tappable away from the prompt',
    );
    await evaluate("document.querySelector('.kiosk-start-surface').click()");
    await until("!!document.querySelector('.capture-review[open]')", 30000);
    assert.equal(guestStrip.photos.length, 4);
    await evaluate(
      "document.querySelector('.capture-review-effects button:nth-child(2)').click()",
    );
    await until(
      "decodeURIComponent(document.querySelector('.capture-review-preview img').src).includes('grayscale(1)')",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.capture-review-photo img')).filter",
      ),
      'grayscale(1)',
    );
    await evaluate(
      "document.querySelector('.capture-review-effects button:first-child').click()",
    );
    await until(
      "!decodeURIComponent(document.querySelector('.capture-review-preview img').src).includes('grayscale(1)')",
    );
    await evaluate(
      "document.querySelector('.capture-review-effects button:nth-child(2)').click()",
    );
    await until(
      "document.querySelector('.capture-review-effects button:nth-child(2)').getAttribute('aria-pressed') === 'true'",
    );
    await evaluate(
      "document.querySelector('.capture-review-footer .primary-button').click()",
    );
    await until("!!document.querySelector('.kiosk-stage-done')");
    await evaluate(
      "document.querySelector('.kiosk-done-preview img').decode()",
    );
    assert.equal(
      await evaluate(`(() => {
      const image = document.querySelector('.kiosk-done-preview img').getBoundingClientRect();
      const box = document.querySelector('.kiosk-done-preview').getBoundingClientRect();
      return image.top >= box.top && image.bottom <= box.bottom && image.bottom <= innerHeight && image.width <= 350;
    })()`),
      true,
      'The complete saved strip must fit inside its preview and viewport',
    );
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(
      path.join(artifacts, 'kiosk-saved-strip.png'),
      (await contents.capturePage()).toPNG(),
    );
    await evaluate("document.querySelector('.kiosk-done-copy button').click()");
    await until("!!document.querySelector('.kiosk-stage-design')");
    await evaluate("document.querySelector('.kiosk-exit-button').click()");
    await until("!!document.querySelector('.exit-booth-dialog[open]')");
    await evaluate(
      "document.querySelector('.exit-booth-dialog .outline-button').click()",
    );
    await until("!document.querySelector('.exit-booth-dialog')");
    assert.equal(
      await evaluate("!!document.querySelector('.kiosk-mode')"),
      true,
      'Canceling exit keeps the guest booth open',
    );
    await evaluate("document.querySelector('.kiosk-exit-button').click()");
    await until("!!document.querySelector('.exit-booth-dialog[open]')");
    await evaluate(
      "document.querySelector('.exit-booth-dialog .primary-button').click()",
    );
    await until("!document.querySelector('.kiosk-mode')");
    console.log(
      'PASS: retakes, confirmation/retry, rotated captured pixels in the final JPEG, sequence reset, missing-file handling, and camera kiosk flow',
    );
    console.log(
      `Review screenshot: ${path.join(artifacts, 'capture-review.png')}`,
    );
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    window?.destroy();
    app.exit(1);
  }
});
