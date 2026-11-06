// Isolated form regression check: no printer access, camera or user library.
const { app, BrowserWindow, ipcMain } = require('electron');
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
    handle('window:theme');
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
    await run("document.querySelector('.usage-notice-consent input').click()");
    await until(
      "!document.querySelector('.usage-notice-actions .primary-button').disabled",
    );
    await run(
      "document.querySelector('.usage-notice-actions .primary-button').click()",
    );
    await until("!!document.querySelector('.studio-tools')");
    await run(
      "document.querySelector('.studio-tools summary').click(); Array.from(document.querySelectorAll('.studio-tools-menu button')).find(button=>button.textContent.includes('Printer settings')).click()",
    );
    await until(
      "!!document.querySelector('#printer-sheets') && !document.querySelector('#printer-sheets').disabled",
    );
    await run(
      'document.querySelector(\'button[aria-label="Increase Sheets per print"]\').click()',
    );
    await until(
      "document.querySelector('#printer-sheets').value==='3' && document.querySelector('.printer-content').textContent.includes('3 sheets')",
    );
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
    assert.equal(
      await run(
        'document.querySelector(\'input[aria-label="Minimum width"]\').value',
      ),
      '0.01',
      'Decimal step persists in parent state after remount',
    );
    // Hidden-window captures should show the final palette, not a paused transition.
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    for (const theme of ['light', 'dark', 'vyora']) {
      await run(
        `Array.from(document.querySelectorAll('.theme-menu button')).find(button=>button.querySelector('strong')?.textContent==='${theme === 'vyora' ? 'VYORA' : theme === 'dark' ? 'Dark' : 'Light'}').click()`,
      );
      await until(`document.documentElement.dataset.theme==='${theme}'`);
      await run("document.querySelector('.paper-profile').open=true");
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
    }
    console.log(
      'PASS: numeric stepper updates parent state, respects bounds, preserves empty validation and decimal precision; input themes captured.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    window?.destroy();
    app.exit(process.exitCode || 0);
  }
});
