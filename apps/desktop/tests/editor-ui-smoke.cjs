// Isolated editor interaction check using a synthetic transparent frame.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const root = path.resolve(__dirname, '..');
const bundle = existsSync(
  path.join(root, '.vite/renderer/main_window/index.html'),
)
  ? root
  : path.join(root, 'out/VYORA-win32-x64/resources/app.asar');
const artifacts = path.join(root, 'out', 'test-editor');
mkdirSync(path.join(artifacts, 'profile'), { recursive: true });
app.setPath('userData', path.join(artifacts, 'profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  let window;
  try {
    ipcMain.handle('window:theme', () => ({ ok: true }));
    ipcMain.handle('guest:status', () => ({
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
    let savedTemplate;
    let libraryReads = 0;
    ipcMain.handle('template:list', () => ({
      ok: true,
      value: savedTemplate
        ? [{ ...savedTemplate, preview: savedTemplate.frame }]
        : [],
    }));
    ipcMain.handle('template:save', (_event, draft) => {
      assert.equal(draft.slots.length, 4);
      savedTemplate = { ...draft, id: '22222222-2222-4222-8222-222222222222' };
      return { ok: true, value: savedTemplate };
    });
    ipcMain.handle('template:read', (_event, id) => {
      assert.equal(id, savedTemplate.id);
      return { ok: true, value: savedTemplate };
    });
    ipcMain.handle('template:update', (_event, { id, template }) => {
      assert.equal(id, savedTemplate.id);
      savedTemplate = { ...template, id };
      return { ok: true, value: savedTemplate };
    });
    ipcMain.handle('template:remove', (_event, id) => {
      assert.equal(id, savedTemplate.id);
      savedTemplate = undefined;
      return { ok: true };
    });
    ipcMain.handle('library:read', () => {
      libraryReads++;
      return {
        ok: true,
        value: {
          directory: artifacts,
          photos: [],
          photoCount: 0,
          strips: [],
          stripCount: 0,
        },
      };
    });
    const pixels = Buffer.alloc(400 * 800 * 4);
    for (let y = 0; y < 800; y++)
      for (let x = 0; x < 400; x++) {
        const hole =
          x >= 40 && x < 360 && ((y >= 50 && y < 330) || (y >= 400 && y < 680));
        pixels.set([160, 100, 210, hole ? 0 : 255], (y * 400 + x) * 4);
      }
    const frame = nativeImage
      .createFromBitmap(pixels, { width: 400, height: 800 })
      .toPNG()
      .toString('base64');
    window = new BrowserWindow({
      width: 1200,
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
    await contents.session.clearStorageData({ storages: ['localstorage'] });
    const evaluate = (source) => contents.executeJavaScript(source);
    const until = async (source) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await evaluate(source)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Editor condition timed out: ${source}`);
    };
    const addMissingAreas = async () => {
      for (const count of [3, 4]) {
        await evaluate(
          `document.querySelector('button[aria-label="Increase Number of areas"]').click()`,
        );
        await until(
          `document.querySelector('input[aria-label="Number of areas"]').value === '${count}'`,
        );
      }
    };
    const dragTilt = async (degrees) => {
      const geometry = await evaluate(`(() => {
        const handle = document.querySelector('.template-rotate-handle').getBoundingClientRect();
        const area = document.querySelector('.template-photo-area.selected').getBoundingClientRect();
        return {x: handle.x + handle.width / 2, y: handle.y + handle.height / 2, cx: area.x + area.width / 2, cy: area.y + area.height / 2};
      })()`);
      const start = { x: Math.round(geometry.x), y: Math.round(geometry.y) };
      contents.sendInputEvent({
        type: 'mouseDown',
        ...start,
        button: 'left',
        clickCount: 1,
      });
      const dx = geometry.x - geometry.cx,
        dy = geometry.y - geometry.cy;
      let point = start;
      for (let step = 1; step <= 10; step++) {
        const angle = (((degrees * Math.PI) / 180) * step) / 10;
        point = {
          x: Math.round(
            geometry.cx + dx * Math.cos(angle) - dy * Math.sin(angle),
          ),
          y: Math.round(
            geometry.cy + dx * Math.sin(angle) + dy * Math.cos(angle),
          ),
        };
        contents.sendInputEvent({
          type: 'mouseMove',
          ...point,
          button: 'left',
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      contents.sendInputEvent({
        type: 'mouseUp',
        ...point,
        button: 'left',
        clickCount: 1,
      });
      await until("!document.querySelector('.template-canvas.is-rotating')");
    };
    await window.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    await until("!!document.querySelector('.usage-welcome')");
    assert.equal(
      libraryReads,
      0,
      'The studio must not mount before acceptance',
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.usage-notice-actions .primary-button').disabled",
      ),
      true,
    );
    await evaluate(
      "window.__declined = false; window.close = () => { window.__declined = true; }; document.querySelector('.usage-notice-actions .outline-button').click()",
    );
    assert.equal(
      await evaluate('window.__declined'),
      true,
      'Decline requests that the window close',
    );
    assert.equal(libraryReads, 0, 'Declining must not open the studio');
    for (const theme of ['light', 'dark', 'vyora']) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      contents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await contents.capturePage();
      await new Promise((resolve) => setTimeout(resolve, 100));
      writeFileSync(
        path.join(artifacts, `first-launch-notice-${theme}.png`),
        (await contents.capturePage()).toPNG(),
      );
    }
    await evaluate(
      "document.querySelector('.usage-notice-consent input').click()",
    );
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await evaluate(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.settings-view-switch')");
    const acceptance = await evaluate(
      "JSON.parse(localStorage.getItem('vyora.notice-acceptance'))",
    );
    assert.equal(acceptance.revision, '2026-11-02.1');
    assert.equal(acceptance.appVersion, '0.1.0');
    assert.ok(Number.isFinite(Date.parse(acceptance.acceptedAt)));
    await Promise.all([
      new Promise((resolve) => contents.once('did-finish-load', resolve)),
      contents.reload(),
    ]);
    await until("!!document.querySelector('.settings-view-switch')");
    assert.equal(
      await evaluate("!!document.querySelector('.usage-welcome')"),
      false,
      'Accepted notice stays accepted after reload',
    );
    await evaluate(
      "localStorage.setItem('vyora.notice-acceptance', JSON.stringify({ revision: 'older', appVersion: '0.1.0', acceptedAt: new Date().toISOString() }))",
    );
    await Promise.all([
      new Promise((resolve) => contents.once('did-finish-load', resolve)),
      contents.reload(),
    ]);
    await until("!!document.querySelector('.usage-welcome')");
    await evaluate(`window.__setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'vyora.notice-acceptance') throw new Error('Storage fixture failure');
        return window.__setItem.call(this, key, value);
      };
      document.querySelector('.usage-notice-consent input').click()`);
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await evaluate(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until(
      "!!document.querySelector('.usage-notice-footer [role=status]')",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.usage-welcome')"),
      true,
      'A failed acceptance save must be explained',
    );
    await evaluate(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.settings-view-switch')");
    await Promise.all([
      new Promise((resolve) => contents.once('did-finish-load', resolve)),
      contents.reload(),
    ]);
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
    await until("!!document.querySelector('.settings-view-switch')");
    await evaluate(
      "document.querySelector('.studio-tools summary').click(); Array.from(document.querySelectorAll('.studio-tools button')).find(button => button.textContent.includes('Terms & privacy')).click()",
    );
    await until("!!document.querySelector('.usage-notice-dialog[open]')");
    await evaluate(
      "document.querySelector('.usage-notice-dialog footer button').click()",
    );
    await until("!document.querySelector('.usage-notice-dialog')");
    await until("!!document.querySelector('.settings-view-switch')");
    const studioSize = window.getContentSize();
    const studioGeometry = () =>
      evaluate(`[
      ...['.capture-column', '.viewfinder', '.settings-panel'].map(
        selector => document.querySelector(selector).getBoundingClientRect().height,
      ),
      document.querySelector('.session-summary').getBoundingClientRect().top + scrollY,
    ]`);
    for (const size of [studioSize, [840, 680]]) {
      window.setContentSize(...size);
      await until(`innerWidth === ${size[0]} && innerHeight === ${size[1]}`);
      await evaluate(
        "document.querySelector('[aria-controls=capture-settings]').click()",
      );
      await until(
        "document.querySelector('[aria-controls=capture-settings]').getAttribute('aria-pressed') === 'true'",
      );
      const captureGeometry = await studioGeometry();
      await evaluate(
        "document.querySelector('[aria-controls=frame-settings]').click()",
      );
      await until(
        "document.querySelector('[aria-controls=frame-settings]').getAttribute('aria-pressed') === 'true'",
      );
      assert.deepEqual(
        await studioGeometry(),
        captureGeometry,
        'Switching settings tabs must preserve the preview, cards and footer',
      );
      assert.equal(
        await evaluate(`(() => {
        const tab = document.querySelector('[aria-controls=frame-settings]');
        tab.focus();
        document.querySelector('#capture-settings .camera-picker summary').focus();
        return document.activeElement === tab;
      })()`),
        true,
        'The inactive tab must stay out of keyboard focus',
      );
    }
    window.setContentSize(...studioSize);
    await evaluate(
      "document.querySelectorAll('.settings-view-switch button')[1].click()",
    );
    await until(
      "!!document.querySelector('.custom-template-controls > button') && !document.querySelector('.custom-template-controls > button').disabled",
    );
    await evaluate(
      "document.querySelector('.custom-template-controls > button').click()",
    );
    await until("!!document.querySelector('.template-dialog[open]')");
    await evaluate(
      `(() => { const input = document.querySelector('.template-dialog input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob('${frame}'), c => c.charCodeAt(0))], 'Test frame.png', {type: 'image/png'})); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()`,
    );
    await until(
      "document.querySelectorAll('.template-photo-area:not(.drawing)').length === 2 && !!document.querySelector('.template-rotate-handle')",
    );
    await evaluate(
      "window.__dragEvents = []; for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) document.addEventListener(type, e => window.__dragEvents.push([type, e.pointerId, e.target.className]), true)",
    );
    await dragTilt(20);
    await until(
      "Math.abs(parseFloat(document.querySelector('.template-photo-area.selected').style.transform.replace('rotate(', '')) - 20) < 2",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.template-tilt-stepper')"),
      false,
    );
    await dragTilt(-20);
    await until(
      "Math.abs(parseFloat(document.querySelector('.template-photo-area.selected').style.transform.replace('rotate(', ''))) < 2",
    );
    const selectLayer = async (label) => {
      await evaluate(
        'document.querySelector(\'[aria-label^="Frame position:"]\').click()',
      );
      await until(
        "!!document.querySelector('.studio-select-menu:popover-open [role=option]')",
      );
      await evaluate(
        `Array.from(document.querySelectorAll('.studio-select-menu:popover-open [role=option]')).find(option => option.textContent.trim().startsWith(${JSON.stringify(label)})).click()`,
      );
      await until(
        `!!document.querySelector(${JSON.stringify('[aria-label="Frame position: ' + label + '"]')})`,
      );
    };
    const dragResize = async () => {
      const geometry = await evaluate(`(() => {
        const area = document.querySelector('.template-photo-area.selected');
        const handle = area.querySelector('.handle-e');
        const box = handle.getBoundingClientRect();
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        return { x, y, width: parseFloat(area.style.width), hittable: document.elementFromPoint(x, y) === handle };
      })()`);
      assert.equal(
        geometry.hittable,
        true,
        'The selected resize handle must be above the artwork',
      );
      contents.sendInputEvent({
        type: 'mouseDown',
        x: geometry.x,
        y: geometry.y,
        button: 'left',
        clickCount: 1,
      });
      contents.sendInputEvent({
        type: 'mouseMove',
        x: geometry.x - 12,
        y: geometry.y,
        button: 'left',
      });
      contents.sendInputEvent({
        type: 'mouseUp',
        x: geometry.x - 12,
        y: geometry.y,
        button: 'left',
        clickCount: 1,
      });
      await until(
        `parseFloat(document.querySelector('.template-photo-area.selected').style.width) < ${geometry.width - 1}`,
      );
    };
    await evaluate(
      "document.querySelector('.template-view-tabs button:nth-child(2)').click()",
    );
    await until(
      "!!document.querySelector('.template-canvas.is-preview .template-photo-area.selected .handle-e')",
    );
    for (const [label, hasMask] of [
      ['Above photos', false],
      ['Behind photos', true],
    ]) {
      if (hasMask) {
        window.setContentSize(960, 720);
        await until('innerWidth === 960 && innerHeight === 720');
      }
      await selectLayer(label);
      for (const view of [2, 1]) {
        await evaluate(
          `document.querySelector('.template-view-tabs button:nth-child(${view})').click()`,
        );
        await until(
          `document.querySelector('.template-canvas').classList.contains('is-preview') === ${view === 2}`,
        );
        assert.equal(
          await evaluate(
            "document.querySelector('.template-composition [data-layer=frame]').hasAttribute('mask')",
          ),
          hasMask,
        );
        await dragResize();
      }
    }
    window.setContentSize(...studioSize);
    await until(
      `innerWidth === ${studioSize[0]} && innerHeight === ${studioSize[1]}`,
    );
    contents.debugger.attach('1.3');
    await contents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    assert.deepEqual(
      await evaluate(`(() => {
        const input = document.querySelector('input[aria-label="Tilt"]');
        input.focus();
        const field = getComputedStyle(input.closest('.number-input'));
        return [getComputedStyle(input).outlineStyle, field.outlineStyle, field.outlineOffset, field.boxShadow];
      })()`),
      ['none', 'solid', '-2px', 'none'],
      'Tilt displays a single outline around its numeric field',
    );
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.handle-nw'), '::after').backgroundColor",
        ),
        'rgb(255, 255, 255)',
      );
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.handle-n'), '::after').backgroundColor",
        ),
        'rgb(255, 255, 255)',
      );
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.template-rotate-handle'), '::before').content",
        ),
        'none',
      );
    }
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(
      path.join(artifacts, 'editor-tilt-controls.png'),
      (await contents.capturePage()).toPNG(),
    );
    const blank = await evaluate(
      "(() => { const r = document.querySelector('.template-viewport').getBoundingClientRect(); return {x: Math.round(r.x + 6), y: Math.round(r.y + 6)}; })()",
    );
    contents.sendInputEvent({
      type: 'mouseDown',
      ...blank,
      button: 'left',
      clickCount: 1,
    });
    contents.sendInputEvent({
      type: 'mouseUp',
      ...blank,
      button: 'left',
      clickCount: 1,
    });
    await until(
      "!document.querySelector('.template-photo-area.selected') && !document.querySelector('.template-tilt-stepper')",
    );
    await addMissingAreas();
    await until(
      "!document.querySelector('.template-dialog-footer .primary-button').disabled",
    );
    await evaluate(
      "document.querySelector('.template-dialog-footer .primary-button').click()",
    );
    await until("!document.querySelector('.template-dialog[open]')");
    const savedId = savedTemplate.id;
    const openTools = async () => {
      await evaluate(
        "document.querySelector('#frame-settings .studio-select-trigger').click()",
      );
      await until(
        "!!document.querySelector('.studio-select-menu:popover-open .studio-select-more')",
      );
      const rowHeight = await evaluate(
        "document.querySelector('.studio-select-more').closest('.studio-select-row').getBoundingClientRect().height",
      );
      await evaluate(
        "document.querySelector('.studio-select-menu:popover-open .studio-select-more').click()",
      );
      await until(
        "!!document.querySelector('.studio-select-tools-toolbar:popover-open')",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.studio-select-more').closest('.studio-select-row').getBoundingClientRect().height",
        ),
        rowHeight,
        'Opening tools must not expand the template row',
      );
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.studio-select-tools-toolbar:popover-open')).position",
        ),
        'fixed',
      );
    };
    await openTools();
    assert.equal(
      await evaluate(
        "document.querySelector('.studio-select-menu:popover-open').contains(document.querySelector('.studio-select-row .studio-select-more'))",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.studio-select-menu:popover-open')).overflow",
      ),
      'hidden',
    );
    contents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await contents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(
      path.join(artifacts, 'template-row-tools.png'),
      (await contents.capturePage()).toPNG(),
    );
    await evaluate(
      "document.querySelector('.studio-select-tools-toolbar:popover-open button').click()",
    );
    await until("!!document.querySelector('.template-dialog[open]')");
    assert.equal(
      await evaluate(
        "document.querySelector('.template-dialog input[type=file]').disabled",
      ),
      true,
    );
    await evaluate(
      "(() => { const input = document.querySelector('.template-dialog input[maxlength]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Edited saved template'); input.dispatchEvent(new Event('input', {bubbles: true})); })()",
    );
    await evaluate(
      "document.querySelector('.template-dialog-footer .primary-button').click()",
    );
    await until("!document.querySelector('.template-dialog[open]')");
    assert.equal(savedTemplate.id, savedId);
    assert.equal(savedTemplate.name, 'Edited saved template');
    const olderTemplate = {
      ...savedTemplate,
      name: 'Legacy short frame',
      slots: savedTemplate.slots.slice(0, 2),
    };
    await openTools();
    await evaluate(
      "document.querySelectorAll('.studio-select-tools-toolbar:popover-open button')[1].click()",
    );
    await until("!!document.querySelector('.template-remove-dialog[open]')");
    await evaluate(
      "document.querySelector('.template-remove-dialog .outline-button').click()",
    );
    await until("!document.querySelector('.template-remove-dialog')");
    assert.equal(savedTemplate.id, savedId, 'Cancel keeps the saved template');
    await openTools();
    await evaluate(
      "document.querySelectorAll('.studio-select-tools-toolbar:popover-open button')[1].click()",
    );
    await until("!!document.querySelector('.template-remove-dialog[open]')");
    await evaluate(
      "document.querySelector('.template-remove-dialog .primary-button').click()",
    );
    await until("!document.querySelector('.template-remove-dialog')");
    assert.equal(savedTemplate, undefined);
    assert.ok(
      (
        await evaluate(
          "document.querySelector('#frame-settings .studio-select-trigger').textContent",
        )
      ).includes('Doodle No. 01'),
    );
    savedTemplate = olderTemplate;
    await window.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    await until("!!document.querySelector('[aria-controls=frame-settings]')");
    await evaluate(
      "document.querySelector('[aria-controls=frame-settings]').click()",
    );
    await until(
      "!document.querySelector('#frame-settings .studio-select-trigger').disabled",
    );
    await evaluate(
      "document.querySelector('#frame-settings .studio-select-trigger').click()",
    );
    await until(
      "Array.from(document.querySelectorAll('.studio-select-option')).some(option => option.textContent.includes('Legacy short frame'))",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.studio-select-option')).find(option => option.textContent.includes('Legacy short frame')).click()",
    );
    await until("!!document.querySelector('.template-dialog[open]')");
    assert.equal(
      await evaluate(
        "document.querySelector('.template-dialog-footer .primary-button').disabled",
      ),
      true,
    );
    await addMissingAreas();
    await evaluate(
      "document.querySelector('.template-dialog-footer .primary-button').click()",
    );
    await until("!document.querySelector('.template-dialog[open]')");
    assert.equal(savedTemplate.id, savedId);
    assert.equal(savedTemplate.slots.length, 4);
    console.log(
      'PASS: first-launch notices, decline, acceptance/revision/storage failure, notice reopening, mouse tilt, deselection, white grips, per-row template tools and edit/remove',
    );
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (window)
      console.error(
        await window.webContents.executeJavaScript(
          'JSON.stringify(window.__dragEvents)',
        ),
      );
    window?.destroy();
    app.exit(1);
  }
});
