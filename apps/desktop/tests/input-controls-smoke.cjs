// Isolated form regression check: no printer access, camera or user library.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bundle = fs.existsSync(
  path.join(root, '.vite/renderer/main_window/index.html'),
)
  ? root
  : path.join(root, 'out/VYORA-win32-x64/resources/app.asar');
const artifacts = path.join(root, 'out/test-inputs');
fs.mkdirSync(path.join(artifacts, 'profile'), { recursive: true });
app.setPath('userData', path.join(artifacts, 'profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let window;
  try {
    const handle = (name, callback) =>
      ipcMain.handle(name, (_event, value) => ({
        ok: true,
        value: callback?.(value),
      }));
    nativeTheme.themeSource = 'dark';
    let requestedTheme;
    handle('window:theme', (theme) => {
      requestedTheme = theme;
    });
    handle('guest:status', () => ({
      displays: [],
      displayId: null,
      tablet: false,
      urls: [],
      pairingCode: '',
      devices: [],
    }));
    handle('template:list', () => []);
    handle('library:read', () => ({
      directory: artifacts,
      photos: [],
      photoCount: 0,
      strips: [],
      stripCount: 0,
    }));
    handle('printer:state', () => ({
      devices: [{ name: 'Fixture', displayName: 'Fixture printer' }],
      settings: { deviceName: 'Fixture', layout: 'double-strip', copies: 2 },
      settingsIssue: '',
      busy: false,
      job: null,
    }));
    window = new BrowserWindow({
      width: 1100,
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
    const wc = window.webContents;
    const run = (source) => wc.executeJavaScript(source);
    const openTool = (name) =>
      run(
        `document.querySelector('.studio-tools summary').click(); Array.from(document.querySelectorAll('.studio-tools-menu button')).find(button=>button.querySelector('strong')?.textContent===${JSON.stringify(name)}).click()`,
      );
    const until = async (source) => {
      const start = Date.now();
      while (Date.now() - start < 12000) {
        if (await run(source)) return;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error('Timed out: ' + source);
    };
    await wc.session.clearStorageData({ storages: ['localstorage'] });
    await window.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    await until("!!document.querySelector('.usage-notice-consent input')");
    assert.equal(await run('document.documentElement.dataset.theme'), 'vyora');
    assert.equal(requestedTheme, 'vyora');
    await run("document.querySelector('.usage-notice-consent input').click()");
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await run(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.studio-tools')");
    // Hidden-window checks use the final palette, not a paused transition.
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const enterKeyboardFocus = async () => {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await until("!!document.activeElement?.matches(':focus-visible')");
    };
    await enterKeyboardFocus();
    const checkFocus = async (selector, visualSelector = selector) => {
      assert.deepEqual(
        await run(`(() => {
          const control = document.querySelector(${JSON.stringify(selector)});
          control.focus();
          const visual = document.querySelector(${JSON.stringify(visualSelector)});
          const style = getComputedStyle(visual);
          return {
            focused: document.activeElement === control,
            outline: style.outlineStyle,
            width: style.outlineWidth,
            offset: style.outlineOffset,
            shadow: style.boxShadow,
            innerOutline: visual === control ? 'none' : getComputedStyle(control).outlineStyle,
          };
        })()`),
        {
          focused: true,
          outline: 'solid',
          width: '2px',
          offset: '-2px',
          shadow: 'none',
          innerOutline: 'none',
        },
        selector,
      );
    };
    await checkFocus('.studio-tools summary');
    await checkFocus('.camera-picker summary');
    assert.deepEqual(
      await run(`(() => {
        const input = document.querySelector('.mirror-control input');
        input.focus();
        return [getComputedStyle(input).outlineStyle, getComputedStyle(input.nextElementSibling).outlineStyle];
      })()`),
      ['none', 'solid'],
      'The mirror toggle shows focus on its track only',
    );
    await openTool('Printer settings');
    await until(
      "!!document.querySelector('.printer-content .studio-select-trigger:not(:disabled)') && !!document.querySelector('#printer-sheets:not(:disabled)')",
    );
    await enterKeyboardFocus();
    await checkFocus('.printer-content .studio-select-trigger');
    await checkFocus('#printer-sheets', '.printer-quantity .number-input');
    await checkFocus('button[aria-label="Increase Sheets per print"]');
    assert.equal(
      await run(
        "getComputedStyle(document.querySelector('.printer-quantity .number-input')).outlineStyle",
      ),
      'none',
      'Focus on an arrow does not also outline the numeric field',
    );
    await run(
      'document.querySelector(\'button[aria-label="Increase Sheets per print"]\').click()',
    );
    await until("document.querySelector('#printer-sheets').value==='3'");
    await run(
      'document.querySelector(\'button[aria-label="Decrease Sheets per print"]\').click()',
    );
    await until("document.querySelector('#printer-sheets').value==='2'");
    await run(
      "(() => {const input=document.querySelector('#printer-sheets');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'10');input.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await until(
      'document.querySelector(\'button[aria-label="Increase Sheets per print"]\').disabled',
    );
    await run(
      'document.querySelector(\'button[aria-label="Increase Sheets per print"]\').click()',
    );
    assert.equal(
      await run("document.querySelector('#printer-sheets').value"),
      '10',
      'Stepper respects the maximum',
    );
    await run(
      "(() => {const input=document.querySelector('#printer-sheets');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await until(
      "document.querySelector('.printer-footer .primary-button').disabled",
    );
    await run("document.querySelectorAll('.printer-mode button')[1].click()");
    await until(
      "!!document.querySelector('.paper-profile input[type=checkbox]')",
    );
    await run(
      "document.querySelector('.paper-profile').open=true; document.querySelector('.paper-profile input[type=checkbox]').click()",
    );
    await until(
      '!!document.querySelector(\'button[aria-label="Increase Minimum width"]\')',
    );
    await run(
      'document.querySelector(\'button[aria-label="Increase Minimum width"]\').click()',
    );
    await until(
      "document.querySelector('input[aria-label=\"Minimum width\"]').value==='0.01'",
    );
    await run("document.querySelectorAll('.printer-mode button')[0].click()");
    await run("document.querySelectorAll('.printer-mode button')[1].click()");
    await until(
      '!!document.querySelector(\'input[aria-label="Minimum width"]\')',
    );
    await run("document.querySelector('.paper-profile').open=true");
    await checkFocus(
      'input[aria-label="Minimum width"]',
      '.paper-profile .number-input:has(input[aria-label="Minimum width"])',
    );
    assert.equal(
      await run(
        'document.querySelector(\'input[aria-label="Minimum width"]\').value',
      ),
      '0.01',
      'Decimal step persists in parent state after remount',
    );
    await run("document.querySelector('.printer-header button').click()");
    for (const theme of ['light', 'vyora', 'dark']) {
      await openTool('Appearance');
      await until("!!document.querySelector('.appearance-dialog[open]')");
      await run(
        `Array.from(document.querySelectorAll('.theme-menu button')).find(button=>button.querySelector('strong')?.textContent==='${theme === 'vyora' ? 'VYORA' : theme === 'dark' ? 'Dark' : 'Light'}').click()`,
      );
      await until(`document.documentElement.dataset.theme==='${theme}'`);
      assert.equal(
        await run("localStorage.getItem('vyora.appearance')"),
        theme,
      );
      await run("document.querySelector('.appearance-header button').click()");
      await until("document.activeElement.matches('.studio-tools summary')");
      await openTool('Printer settings');
      await until(
        "!!document.querySelector('#printer-sheets') && !document.querySelector('#printer-sheets').disabled",
      );
      await run("document.querySelectorAll('.printer-mode button')[1].click()");
      await until(
        "!!document.querySelector('.paper-profile input[type=checkbox]:not(:disabled)')",
      );
      await run(
        "document.querySelector('.paper-profile').open=true; document.querySelector('.paper-profile input[type=checkbox]').click()",
      );
      await until(
        'document.querySelector(\'input[aria-label="Minimum width"]\').getBoundingClientRect().height>0',
      );
      wc.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await wc.capturePage();
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(
        path.join(artifacts, `inputs-${theme}.png`),
        (await wc.capturePage()).toPNG(),
      );
      await run("document.querySelector('.printer-header button').click()");
    }
    await window.loadFile(
      path.join(bundle, '.vite/renderer/main_window/index.html'),
    );
    await until("!!document.querySelector('.studio-tools')");
    assert.equal(await run('document.documentElement.dataset.theme'), 'dark');
    console.log(
      'PASS: VYORA on first launch, Appearance via Studio tools, saved theme on reload, keyboard focus, and numeric input controls.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    window?.destroy();
    app.exit(process.exitCode || 0);
  }
});
