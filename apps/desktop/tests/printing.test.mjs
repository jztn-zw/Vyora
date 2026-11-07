import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  mkdir,
} from 'node:fs/promises';
import path from 'node:path';
import { PrinterService } from '../src/printing/printer-service.ts';
import { printerSettingsStore } from '../src/printing/printer-settings.ts';
import {
  PrintError,
  PrintUncertainError,
  printDocument,
  printGeometry,
  validatePrinterSettings,
  validatePrintRequest,
} from '../src/printing/print-layout.ts';
import { submitPrintWindow } from '../src/printing/print-window.ts';
import { describePrinter } from '../src/printing/printer-readiness.ts';

const settings = {
  deviceName: 'PhotoPrinter-System-Name',
  layout: 'double-strip',
  copies: 1,
};
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
const stripImage = { jpeg, size: { width: 600, height: 1800 } };
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const printRequest = () => ({ id: randomUUID(), requestId: randomUUID() });

test('print sizes are exactly 2×6 or 4×6 inches and complete images fit without cropping', () => {
  assert.deepEqual(printGeometry('single-strip').pageSize, {
    width: 50800,
    height: 152400,
  });
  assert.deepEqual(printGeometry('double-strip').pageSize, {
    width: 101600,
    height: 152400,
  });
  assert.throws(() => printGeometry('A4'), PrintError);
  for (const [layout, count, width] of [
    ['single-strip', 1, '50.8'],
    ['double-strip', 2, '101.6'],
  ]) {
    const html = printDocument(jpeg, { ...settings, layout });
    assert.equal((html.match(/<img /g) || []).length, count);
    assert.ok(html.includes(`size: ${width}mm 152.4mm`));
    assert.ok(html.includes('object-fit: contain'));
    assert.ok(html.includes("script-src 'none'"));
    assert.ok(!html.includes('<script'));
  }
});

test('print inputs reject remote files, executable images, injection and invalid settings', () => {
  for (const source of [
    'https://example.com/photo.jpg',
    'file:///private.jpg',
    'data:image/svg+xml;base64,AAAA',
    'data:image/jpeg;base64,AAAA" onerror="alert(1)',
  ])
    assert.throws(() => printDocument(source, settings), PrintError);
  for (const invalid of [
    null,
    {},
    { ...settings, copies: 0 },
    { ...settings, copies: 11 },
    { ...settings, copies: 1.5 },
    { ...settings, deviceName: '' },
    { ...settings, deviceName: 'cam\nprinter' },
    { ...settings, layout: 'letter' },
  ])
    assert.throws(() => validatePrinterSettings(invalid), PrintError);
  assert.deepEqual(
    validatePrinterSettings({ ...settings, ignored: '/arbitrary/path' }),
    settings,
  );
  assert.throws(
    () => validatePrintRequest({ id: '../../secret', requestId: randomUUID() }),
    PrintError,
  );
  assert.throws(
    () => validatePrintRequest({ id: randomUUID(), requestId: '' }),
    PrintError,
  );
});

async function fixture(t, saved = settings) {
  const f = {
    devices: [{ name: settings.deviceName, displayName: 'Photo printer' }],
    submissions: [],
    readIds: [],
    current: saved,
  };
  f.adapter = {
    async list() {
      return f.devices;
    },
    async readStrip(id) {
      f.readIds.push(id);
      return stripImage;
    },
    async submit(html, selected, _signal, onSubmitting, target) {
      onSubmitting();
      f.submissions.push({ html, selected, target });
    },
  };
  f.store = {
    async read() {
      return { settings: f.current, issue: '' };
    },
    async write(value) {
      f.current = value;
    },
  };
  f.service = new PrinterService(f.adapter, f.store);
  await f.service.initialize();
  t.after(() => f.service.dispose());
  return f;
}

test('detection never selects or prints without saved operator settings', async (t) => {
  const f = await fixture(t, null);
  const state = await f.service.state();
  assert.equal(state.devices.length, 1);
  assert.equal(state.settings, null);
  assert.equal(state.busy, false);
  assert.throws(() => f.service.start(printRequest()), /Choose and save/);
  assert.equal(f.submissions.length, 0);
});

test('auto-print uses Windows readiness and rejects offline, error, unknown and virtual printers', async (t) => {
  for (const status of [
    0x80, 0x1, 0x2, 0x8, 0x10, 0x1000, 0x400000, 0x800000,
  ]) {
    assert.notEqual(
      describePrinter({ name: 'Photo', status }, 'win32').readiness,
      'ready',
    );
  }
  assert.equal(
    describePrinter({ name: 'Photo', status: 0 }, 'win32').readiness,
    'ready',
  );
  assert.equal(
    describePrinter({ name: 'Photo', status: 0x400 }, 'win32').readiness,
    'ready',
  );
  assert.equal(
    describePrinter({ name: 'Photo' }, 'win32').readiness,
    'unknown',
  );
  for (const status of [-1, 1.5, 0x100000000])
    assert.equal(
      describePrinter({ name: 'Photo', status }, 'win32').readiness,
      'unknown',
    );
  for (const status of [0x200000, 0x2000000])
    assert.equal(
      describePrinter({ name: 'Photo', status }, 'win32').readiness,
      'unavailable',
    );
  assert.equal(
    describePrinter({ name: 'Microsoft Print to PDF', status: 0 }, 'win32')
      .virtual,
    true,
  );
  const f = await fixture(t);
  await assert.rejects(f.service.setAutoPrint(true), /not confirmed/);
  assert.equal(f.current.autoPrint, undefined);
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0 },
    'win32',
  );
  await f.service.setAutoPrint(true);
  assert.equal(f.current.autoPrint, true);
  assert.equal(
    f.submissions.length,
    0,
    'Enabling and preflighting never print',
  );
  await f.service.checkAutoPrint();
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0x80 },
    'win32',
  );
  await assert.rejects(f.service.checkAutoPrint(), /offline/);
  f.devices = [];
  await f.service.setAutoPrint(false);
  await f.service.checkAutoPrint();
});

test('one saved session auto-prints once and holds the next group until release', async (t) => {
  const f = await fixture(t, { ...settings, autoPrint: true });
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0 },
    'win32',
  );
  const pending = deferred();
  f.adapter.submit = async (_html, _settings, _signal, onSubmitting) => {
    onSubmitting();
    f.submissions.push('job');
    await pending.promise;
  };
  const id = randomUUID();
  f.service.autoStart(id);
  f.service.autoStart(id);
  await flush();
  assert.equal(f.submissions.length, 1);
  assert.equal(f.service.activity().autoPrint.status, 'submitting');
  await assert.rejects(f.service.checkAutoPrint(), /Finish the current/);
  assert.throws(() => f.service.releaseAutoPrint(id, true));
  assert.throws(() => f.service.start(printRequest()), /automatic print/);
  pending.resolve();
  await flush();
  assert.equal(f.service.activity().autoPrint.status, 'submitted');
  await assert.rejects(f.service.checkAutoPrint(), /Finish the current/);
  f.service.releaseAutoPrint(id, false);
  assert.equal(f.service.activity().autoPrint, null);
  await f.service.checkAutoPrint();
  f.service.autoStart(id);
  await flush();
  assert.equal(
    f.submissions.length,
    1,
    'Release and repeated save callbacks cannot reprint the same session',
  );
});

test('disconnect after capture preserves a failed auto-print for operator retry without resending silently', async (t) => {
  const f = await fixture(t, { ...settings, autoPrint: true });
  const id = randomUUID();
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0x80 },
    'win32',
  );
  f.service.autoStart(id);
  await flush();
  assert.equal(f.service.activity().autoPrint.status, 'failed');
  assert.equal(f.submissions.length, 0);
  assert.throws(() => f.service.releaseAutoPrint(id, false));
  await assert.rejects(f.service.retryAutoPrint(id), /offline/);
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0 },
    'win32',
  );
  await f.service.retryAutoPrint(id);
  await flush();
  assert.equal(f.submissions.length, 1);
  assert.equal(f.service.activity().autoPrint.status, 'submitted');
  await assert.rejects(f.service.retryAutoPrint(id));
  f.service.releaseAutoPrint(id, false);
  f.devices = [];
  const next = randomUUID();
  f.service.autoStart(next);
  await flush();
  assert.equal(f.service.activity().autoPrint.status, 'failed');
  f.service.releaseAutoPrint(next, true);
  assert.equal(f.submissions.length, 1);
});

test('auto-print cannot use full sheets and an uncertain native job never permits retry', async (t) => {
  assert.throws(
    () =>
      validatePrinterSettings({
        ...settings,
        layout: 'sheet',
        autoPrint: true,
      }),
    /Photo printer/,
  );
  const f = await fixture(t, { ...settings, autoPrint: true });
  f.devices[0] = describePrinter(
    { name: settings.deviceName, status: 0 },
    'win32',
  );
  f.adapter.submit = async (_html, _settings, _signal, submitting) => {
    submitting();
    throw new PrintUncertainError('Worker lost');
  };
  const id = randomUUID();
  f.service.autoStart(id);
  await flush();
  assert.equal(f.service.activity().autoPrint.status, 'uncertain');
  await assert.rejects(f.service.retryAutoPrint(id));
  assert.throws(() => f.service.releaseAutoPrint(id, false));
  f.service.releaseAutoPrint(id, true);
  await f.service.checkAutoPrint();
  assert.equal(f.service.activity().autoPrint, null);
});

test('auto fit uses one full sheet for square and wider frames and rotates landscape art', async (t) => {
  const f = await fixture(t);
  for (const [size, photoSize, rotated] of [
    [{ width: 1200, height: 1200 }, { width: 101600, height: 101600 }, false],
    [{ width: 1200, height: 1800 }, { width: 101600, height: 152400 }, false],
    [{ width: 1800, height: 1200 }, { width: 152400, height: 101600 }, true],
  ]) {
    f.adapter.readStrip = async () => ({ jpeg, size });
    f.service.start(printRequest());
    await flush();
    const submitted = f.submissions.at(-1);
    assert.deepEqual(submitted.target, {
      pageSize: { width: 101600, height: 152400 },
      images: 1,
    });
    assert.equal((submitted.html.match(/<img /g) || []).length, 1);
    assert.equal(submitted.html.includes('class="rotated"'), rotated);
    assert.deepEqual(printGeometry('double-strip', size).photoSize, photoSize);
    assert.equal(f.service.activity().job.stripsPerSheet, 1);
  }
  assert.deepEqual(
    printGeometry('single-strip', { width: 900, height: 900 }).photoSize,
    {
      width: 50800,
      height: 50800,
    },
  );
});

test('one request prints once; concurrent and replayed requests cannot duplicate jobs', async (t) => {
  const f = await fixture(t);
  const input = printRequest();
  const first = f.service.start(input);
  assert.equal(first.status, 'preparing');
  assert.equal(f.service.start(input).id, first.id);
  assert.throws(
    () => f.service.start({ ...input, id: randomUUID() }),
    /another strip/,
  );
  assert.throws(() => f.service.start(printRequest()), /Another print job/);
  await flush();
  const result = f.service.start(input);
  assert.equal(result.status, 'submitted');
  assert.equal(f.submissions.length, 1);
  assert.equal(result.sheets, 1);
  assert.equal(result.stripsPerSheet, 2);
  assert.deepEqual(f.readIds, [input.id]);
  assert.equal(f.submissions[0].selected.deviceName, settings.deviceName);
  result.status = 'failed';
  assert.equal(f.service.activity().job.status, 'submitted');
});

test('missing saved printer cannot fall back to another installed printer', async (t) => {
  const f = await fixture(t);
  f.devices = [{ name: 'OtherPrinter', displayName: 'Other printer' }];
  f.service.start(printRequest());
  await flush();
  assert.equal(f.service.activity().job.status, 'failed');
  assert.match(
    f.service.activity().job.message,
    /saved printer is not detected/,
  );
  assert.equal(
    (await f.service.state()).settings.deviceName,
    settings.deviceName,
  );
  assert.equal(f.submissions.length, 0);
  assert.equal(f.readIds.length, 0);
});

test('settings require current detection; disk failures retain previous settings', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.service.save({ ...settings, deviceName: 'missing' }),
    /no longer detected/,
  );
  f.store.write = async () => {
    throw new Error('Disk full');
  };
  await assert.rejects(
    f.service.save({ ...settings, copies: 2 }),
    /Could not save/,
  );
  assert.equal((await f.service.state()).settings.copies, 1);
  f.store.write = async (value) => {
    f.current = value;
  };
  await f.service.save({ ...settings, layout: 'single-strip', copies: 3 });
  f.service.start(printRequest());
  await assert.rejects(f.service.save(settings), /Wait for/);
  await flush();
  assert.equal(f.service.activity().job.stripsPerSheet, 1);
  assert.equal(f.submissions[0].selected.copies, 3);
});

test('concurrent settings writes and printing cannot race', async (t) => {
  const f = await fixture(t);
  const pending = deferred();
  f.store.write = () => pending.promise;
  const save = f.service.save({ ...settings, copies: 2 });
  await flush();
  await assert.rejects(f.service.save(settings), /Wait for/);
  assert.throws(() => f.service.start(printRequest()), /Another print job/);
  pending.resolve();
  await save;
  assert.equal((await f.service.state()).settings.copies, 2);
});

test('unreadable strips fail before submitting without exposing file details', async (t) => {
  const f = await fixture(t);
  f.adapter.readStrip = async () => {
    throw new Error('Secret path or DB detail');
  };
  f.service.start(printRequest());
  await flush();
  assert.equal(f.service.activity().job.status, 'failed');
  assert.equal(f.submissions.length, 0);
  assert.ok(!f.service.activity().job.message.includes('Secret'));
});

test('failed native jobs are never automatically retried', async (t) => {
  const f = await fixture(t);
  let calls = 0;
  f.adapter.submit = async (_html, _settings, _signal, onSubmitting) => {
    onSubmitting();
    calls++;
    throw new PrintError('Printer rejected paper settings.');
  };
  const input = printRequest();
  f.service.start(input);
  await flush();
  assert.equal(f.service.activity().job.status, 'failed');
  f.service.start(input);
  await flush();
  assert.equal(calls, 1);
});

test('stalled printer enumeration times out without submitting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t);
  f.adapter.list = () => new Promise(() => {});
  f.service.start(printRequest());
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(f.service.activity().job.status, 'failed');
  assert.match(f.service.activity().job.message, /printer list/);
  assert.equal(f.service.activity().busy, false);
});

test('preparation deadline prevents printing a late image', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t);
  const pending = deferred();
  f.adapter.readStrip = () => pending.promise;
  f.service.start(printRequest());
  await flush();
  t.mock.timers.tick(15000);
  await flush();
  pending.resolve(stripImage);
  await flush();
  assert.equal(f.submissions.length, 0);
  assert.equal(f.service.activity().job.status, 'failed');
  assert.equal(f.service.activity().busy, false);
});

test('delayed native response locks job until actual callback arrives', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t);
  const pending = deferred();
  let calls = 0;
  f.adapter.submit = async (_html, _settings, _signal, onSubmitting) => {
    calls++;
    onSubmitting();
    await pending.promise;
  };
  const input = printRequest();
  f.service.start(input);
  await flush();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(f.service.activity().job.status, 'uncertain');
  assert.equal(f.service.activity().busy, true);
  assert.throws(() => f.service.start(printRequest()), /Another print job/);
  f.service.start(input);
  assert.equal(calls, 1);
  pending.resolve();
  await flush();
  assert.equal(f.service.activity().job.status, 'submitted');
  assert.equal(f.service.activity().busy, false);
});

test('a worker lost after submission blocks new jobs rather than retrying', async (t) => {
  const f = await fixture(t);
  f.adapter.submit = async (_html, _settings, _signal, onSubmitting) => {
    onSubmitting();
    throw new PrintUncertainError('Worker lost');
  };
  f.service.start(printRequest());
  await flush();
  assert.equal(f.service.activity().job.status, 'uncertain');
  assert.throws(() => f.service.start(printRequest()), /status is unknown/);
});

test('closing VYORA during preparation cannot send a late job', async (t) => {
  const f = await fixture(t);
  const pending = deferred();
  f.adapter.readStrip = () => pending.promise;
  f.service.start(printRequest());
  await flush();
  f.service.dispose();
  pending.resolve(stripImage);
  await flush();
  assert.equal(f.submissions.length, 0);
  assert.throws(() => f.service.start(printRequest()), /shutting down/);
});

test('settings survive restart; corrupt, oversized and future formats require setup', async (t) => {
  const testRoot = path.resolve(import.meta.dirname, '../out');
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'vyora-printer-test-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), testRoot);
    assert.ok(path.basename(resolved).startsWith('vyora-printer-test-'));
    await rm(resolved, { recursive: true });
  });
  const filename = path.join(directory, 'printer-settings.json');
  const store = printerSettingsStore(directory);
  assert.deepEqual(await store.read(), { settings: null, issue: '' });
  await store.write(settings);
  assert.deepEqual(
    (await printerSettingsStore(directory).read()).settings,
    settings,
  );
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).version, 1);
  await store.write({ ...settings, copies: 2 });
  assert.equal((await store.read()).settings.copies, 2);
  assert.deepEqual(await readdir(directory), ['printer-settings.json']);
  for (const json of [
    'bad json',
    JSON.stringify({ version: 99, settings }),
    'x'.repeat(65537),
  ]) {
    await writeFile(filename, json);
    const result = await store.read();
    assert.equal(result.settings, null);
    assert.match(result.issue, /could not be read/);
  }
});

function nativeFixture() {
  const window = new EventEmitter();
  const contents = new EventEmitter();
  const f = {
    window,
    contents,
    callback: null,
    options: null,
    submitted: 0,
    destroyed: false,
  };
  window.webContents = contents;
  window.isDestroyed = () => f.destroyed;
  window.destroy = () => {
    f.destroyed = true;
    window.emit('closed');
  };
  window.loadURL = async () => {};
  contents.setWindowOpenHandler = (callback) => {
    f.openHandler = callback;
  };
  contents.executeJavaScript = async () => 2;
  contents.print = (options, callback) => {
    f.options = options;
    f.callback = callback;
    f.submitted++;
  };
  return f;
}

test('native adapter waits for decoded images and sends exact page settings to selected OS printer', async () => {
  const f = nativeFixture();
  const decoded = deferred();
  f.contents.executeJavaScript = () => decoded.promise;
  const request = submitPrintWindow(
    () => f.window,
    printDocument(jpeg, settings),
    { ...settings, copies: 3 },
    new AbortController().signal,
    () => {},
  );
  await flush();
  assert.equal(f.submitted, 0);
  decoded.resolve(2);
  await flush();
  assert.equal(f.options.deviceName, settings.deviceName);
  assert.deepEqual(f.options.pageSize, { width: 101600, height: 152400 });
  assert.equal(f.options.copies, 3);
  assert.equal(f.options.silent, true);
  assert.deepEqual(f.options.pageRanges, [{ from: 0, to: 0 }]);
  assert.equal(f.openHandler().action, 'deny');
  f.callback(true);
  await request;
  assert.equal(f.destroyed, true);
  assert.equal(f.window.listenerCount('closed'), 0);
  assert.equal(f.contents.listenerCount('render-process-gone'), 0);
});

test('invalid decoded image count cannot print', async () => {
  const f = nativeFixture();
  f.contents.executeJavaScript = async () => 0;
  await assert.rejects(
    submitPrintWindow(
      () => f.window,
      'html',
      settings,
      new AbortController().signal,
      () => {},
    ),
    /Nothing was sent/,
  );
  assert.equal(f.submitted, 0);
  assert.equal(f.destroyed, true);
});

test('aborting preparation destroys worker and prevents late printing', async () => {
  const f = nativeFixture();
  const decoded = deferred();
  f.contents.executeJavaScript = () => decoded.promise;
  const abort = new AbortController();
  const request = submitPrintWindow(
    () => f.window,
    'html',
    settings,
    abort.signal,
    () => {},
  );
  await flush();
  abort.abort();
  await assert.rejects(request, { name: 'AbortError' });
  decoded.resolve(2);
  await flush();
  assert.equal(f.submitted, 0);
  assert.equal(f.destroyed, true);
});

test('native failure gives actionable paper guidance and releases worker', async () => {
  const f = nativeFixture();
  const request = submitPrintWindow(
    () => f.window,
    'html',
    settings,
    new AbortController().signal,
    () => {},
  );
  await flush();
  f.callback(false, 'Invalid printer settings');
  await assert.rejects(request, /paper settings/);
  assert.equal(f.destroyed, true);
});

test('worker crash after submission is uncertain rather than claiming nothing printed', async () => {
  const f = nativeFixture();
  const request = submitPrintWindow(
    () => f.window,
    'html',
    settings,
    new AbortController().signal,
    () => {},
  );
  await flush();
  f.contents.emit('render-process-gone');
  await assert.rejects(request, PrintUncertainError);
  assert.equal(f.destroyed, true);
  f.callback(true);
});

test('unexpected native errors after invoking print remain uncertain', async () => {
  const f = nativeFixture();
  f.contents.print = () => {
    throw new Error('Native response lost');
  };
  await assert.rejects(
    submitPrintWindow(
      () => f.window,
      'html',
      settings,
      new AbortController().signal,
      () => {},
    ),
    PrintUncertainError,
  );
  assert.equal(f.destroyed, true);
});
