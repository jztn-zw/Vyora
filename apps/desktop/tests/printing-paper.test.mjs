import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import {
  arrangePaper,
  validatePlacements,
  validatePaperSpec,
  checkPaperProfile,
  sheetDocument,
  paperPresets,
} from '../src/printing/paper-layout.ts';
import {
  emptyPaperData,
  paperStateStore,
  validatePaperData,
} from '../src/printing/paper-store.ts';
import { PaperService } from '../src/printing/paper-service.ts';
import { PrinterService } from '../src/printing/printer-service.ts';
import {
  PrintError,
  PrintUncertainError,
} from '../src/printing/print-layout.ts';
import { submitPrintWindow } from '../src/printing/print-window.ts';

const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
const stripImage = { jpeg, size: { width: 600, height: 1800 } };
const settings = { deviceName: 'Epson-test', layout: 'sheet', copies: 1 };
const spec = (kind = 'long-bond') => ({
  kind,
  width: paperPresets[kind].width,
  height: paperPresets[kind].height,
  margin: 6350,
  gap: 2540,
  guides: true,
});
const paper = (s = spec()) => ({
  id: randomUUID(),
  name: 'Sheet 1',
  deviceName: settings.deviceName,
  spec: s,
  blocked: [],
  used: [],
  revision: 0,
});
const queue = (n = 20) =>
  Array.from({ length: n }, () => ({
    id: randomUUID(),
    stripId: randomUUID(),
  }));
async function settle(f) {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
    await f?.service.state();
  }
}
async function fixture(t, data = emptyPaperData()) {
  const f = {
    data: structuredClone(data),
    submissions: [],
    writes: 0,
    failWrite: false,
    devices: [{ name: settings.deviceName, displayName: 'Epson' }],
  };
  f.store = {
    async read() {
      return { data: structuredClone(f.data), issue: '' };
    },
    async write(value) {
      if (f.failWrite) throw new Error('disk');
      f.data = structuredClone(value);
      f.writes++;
    },
  };
  f.adapter = {
    async list() {
      return f.devices;
    },
    async readStrip() {
      return stripImage;
    },
    async submit(html, config, signal, submitting, target) {
      assert.ok(
        f.data.batches.some((b) => ['reserved', 'sent'].includes(b.status)),
        'reservation must be durable before native submission',
      );
      submitting();
      f.submissions.push({ html, config, target });
    },
  };
  f.printers = new PrinterService(f.adapter, {
    async read() {
      return { settings, issue: '' };
    },
    async write() {},
  });
  await f.printers.initialize();
  f.service = new PaperService(f.store, f.printers, (id) => {
    if (id === f.missing) throw new PrintError('Saved strip missing');
  });
  await f.service.initialize();
  t.after(() => {
    f.service.dispose();
    f.printers.dispose();
  });
  f.create = async () => {
    const s = await f.service.create({ name: 'My sheet', spec: spec() });
    return s.papers.at(-1);
  };
  f.add = (copies = 1) =>
    f.service.add({ id: randomUUID(), requestId: randomUUID(), copies });
  f.print = (p, requestId = randomUUID()) =>
    f.service.print({
      paperId: p.id,
      revision: p.revision,
      requestId,
      loaded: true,
    });
  return f;
}

test('full sheets retain physical paper size and fixed 2×6-inch strip geometry', () => {
  for (const kind of Object.keys(paperPresets)) {
    const p = paper(spec(kind));
    const positions = arrangePaper(p, queue());
    assert.ok(positions.length >= 3);
    validatePlacements(p, positions);
    for (const r of positions)
      assert.deepEqual(
        [r.width, r.height].sort((a, b) => a - b),
        [50800, 152400],
      );
    const html = sheetDocument(
      p,
      positions,
      new Map(positions.map((r) => [r.stripId, jpeg])),
    );
    assert.ok(
      html.includes(
        `@page{size:${p.spec.width / 1000}mm ${p.spec.height / 1000}mm`,
      ),
    );
    assert.ok(html.includes('object-fit:contain'));
    assert.ok(html.includes("script-src 'none'"));
  }
});

test('used areas and seeded random blocked areas are never covered, including rotations', () => {
  let seed = 17;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 100; i++) {
    const p = paper(spec(i % 2 ? 'a4' : 'long-bond'));
    p.blocked = Array.from({ length: 5 }, () => ({
      x: Math.floor(rand() * 150000),
      y: Math.floor(rand() * 200000),
      width: 20000,
      height: 20000,
    }));
    const positions = arrangePaper(p, queue());
    if (positions.length) validatePlacements(p, positions);
    if (positions.length) {
      p.used.push(positions[0]);
      const next = arrangePaper(p, queue());
      if (next.length) validatePlacements(p, next);
    }
  }
  const p = paper({
    kind: 'custom',
    width: 180000,
    height: 70000,
    margin: 6350,
    gap: 2540,
    guides: true,
  });
  assert.equal(arrangePaper(p, queue())[0].rotated, true);
  p.spec = { ...p.spec, width: 50800, height: 152400 };
  assert.equal(
    arrangePaper(p, queue()).length,
    0,
    'physical 2×6 paper with margins cannot contain a full 2×6 strip',
  );
});

test('paper validation rejects spoofed presets, unsafe guides, overlaps and unsupported offcuts', () => {
  assert.throws(
    () => validatePaperSpec({ ...spec(), width: 200000 }),
    PrintError,
  );
  assert.throws(() => validatePaperSpec({ ...spec(), gap: 0 }), /guides/);
  const p = paper();
  const placements = arrangePaper(p, queue(2));
  assert.throws(
    () =>
      validatePlacements(p, [
        placements[0],
        { ...placements[1], x: placements[0].x, y: placements[0].y },
      ]),
    /overlaps/,
  );
  const custom = { ...spec(), kind: 'custom' };
  assert.throws(() => checkPaperProfile(custom, settings.deviceName), /verify/);
  const profile = {
    deviceName: settings.deviceName,
    verified: true,
    minWidth: 50000,
    minHeight: 100000,
    maxWidth: 220000,
    maxHeight: 350000,
  };
  checkPaperProfile(custom, settings.deviceName, profile);
  assert.throws(() => checkPaperProfile(custom, 'other', profile), /verify/);
  assert.throws(
    () =>
      checkPaperProfile(custom, settings.deviceName, {
        ...profile,
        maxHeight: 300000,
      }),
    /outside/,
  );
});

test('duplicate copies share encoded JPEG data and annotations never print', () => {
  const p = paper();
  p.blocked.push({ x: 0, y: 300000, width: 10000, height: 10000 });
  const q = queue(2);
  q[1].stripId = q[0].stripId;
  const html = sheetDocument(
    p,
    arrangePaper(p, q),
    new Map([[q[0].stripId, jpeg]]),
  );
  assert.equal(html.split(jpeg).length - 1, 1);
  assert.ok(html.includes('data-copy-of="paper-image-0"'));
  assert.ok(!html.includes('blocked'));
  assert.throws(
    () =>
      sheetDocument(
        p,
        arrangePaper(p, q),
        new Map([[q[0].stripId, 'file:///private']]),
      ),
    /Invalid saved/,
  );
});

test('adding is durable, idempotent and concurrent; it never prints automatically', async (t) => {
  const f = await fixture(t);
  await f.create();
  const input = { id: randomUUID(), requestId: randomUUID(), copies: 2 };
  await Promise.all([f.service.add(input), f.service.add(input), f.add()]);
  assert.equal((await f.service.state()).queue.length, 3);
  assert.equal(f.data.queue.length, 3);
  await assert.rejects(f.service.add({ ...input, copies: 3 }), /already used/);
  f.missing = randomUUID();
  await assert.rejects(
    f.service.add({ ...input, requestId: randomUUID(), id: f.missing }),
    /missing/,
  );
  assert.equal(f.submissions.length, 0);
});

test('sheet submission reserves before sending and request replay cannot print twice', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add(3);
  const id = randomUUID();
  await f.print(p, id);
  await settle(f);
  await f.print(p, id);
  await settle(f);
  assert.equal(f.submissions.length, 1);
  assert.deepEqual(f.submissions[0].target.pageSize, {
    width: 215900,
    height: 330200,
  });
  assert.equal(f.submissions[0].target.images, 3);
  const s = await f.service.state();
  assert.equal(s.batches[0].status, 'check');
  await assert.rejects(f.service.remove(s.queue[0].id), /submitted/);
  await assert.rejects(
    f.service.mark({ paperId: p.id, revision: 0, blocked: [] }),
    /submitted/,
  );
  await assert.rejects(f.service.delete(p.id), /submitted/);
  await assert.rejects(f.print(p), /previous/);
});

test('printed result consumes only reserved queue entries and protects used positions', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add(2);
  await f.print(p);
  await settle(f);
  await f.add();
  const before = await f.service.state();
  const s = await f.service.resolve({
    batchId: before.batches[0].id,
    result: 'printed',
  });
  assert.equal(s.queue.length, 1);
  assert.equal(s.papers[0].used.length, 2);
  assert.equal(s.papers[0].revision, 1);
  const positions = arrangePaper(s.papers[0], s.queue);
  validatePlacements(s.papers[0], positions);
  await f.service.resolve({ batchId: before.batches[0].id, result: 'printed' });
  assert.equal((await f.service.state()).papers[0].used.length, 2);
  await assert.rejects(
    f.service.resolve({ batchId: before.batches[0].id, result: 'blank' }),
    /Wait/,
  );
});

test('the sheet queue persists fitted photo sizes and reserves the same boxes shown in preview', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  f.adapter.readStrip = async () => ({
    jpeg,
    size: { width: 1200, height: 1200 },
  });
  await f.add();
  const queued = validatePaperData(f.data).queue;
  assert.deepEqual(
    queued.map((item) => item.size),
    [
      { width: 50800, height: 152400 },
      { width: 101600, height: 101600 },
    ],
  );
  const preview = arrangePaper(p, queued);
  assert.equal(preview.length, 2);
  await f.print(p);
  await settle(f);
  const [batch] = validatePaperData(f.data).batches;
  assert.deepEqual(batch.placements, preview);
  assert.equal(f.submissions[0].target.images, 2);
  const resolved = await f.service.resolve({
    batchId: batch.id,
    result: 'printed',
  });
  assert.deepEqual(
    resolved.papers[0].used,
    preview.map(({ x, y, width, height }) => ({ x, y, width, height })),
  );
});

test('packing skips oversized photos and renders rotated photo boxes at their own dimensions', () => {
  const p = paper();
  p.spec = {
    kind: 'custom',
    width: 110000,
    height: 160000,
    margin: 0,
    gap: 0,
    guides: false,
  };
  const [oversized, landscape] = queue(2);
  // The first image cannot fit on a narrower piece, but a narrow strip can.
  oversized.size = { width: 101600, height: 101600 };
  assert.equal(
    arrangePaper({ ...p, spec: { ...p.spec, width: 70000 } }, [
      oversized,
      { ...landscape },
    ])[0].queueId,
    landscape.id,
  );
  landscape.size = { width: 152400, height: 101600 };
  const placements = arrangePaper(p, [landscape]);
  assert.equal(placements.length, 1);
  assert.equal(placements[0].rotated, true);
  assert.match(
    sheetDocument(p, placements, new Map([[landscape.stripId, jpeg]])),
    /class="rotated" style="width:152\.4mm;height:101\.6mm"/,
  );
});

for (const result of ['blank', 'spoiled'])
  test(`${result} resolution retains queue with conservative paper occupancy`, async (t) => {
    const f = await fixture(t);
    const p = await f.create();
    await f.add();
    await f.print(p);
    await settle(f);
    const before = await f.service.state();
    const s = await f.service.resolve({
      batchId: before.batches[0].id,
      result,
    });
    assert.equal(s.queue.length, 1);
    assert.equal(s.papers[0].used.length, result === 'blank' ? 0 : 1);
  });

test('preparation failure releases reservation; post-submission failure needs operator check', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  f.adapter.readStrip = async () => {
    throw new Error('missing');
  };
  await f.print(p);
  await settle(f);
  assert.equal((await f.service.state()).batches[0].status, 'released');
  assert.equal(f.submissions.length, 0);
  f.adapter.readStrip = async () => stripImage;
  f.adapter.submit = async (_h, _c, _s, submitting) => {
    submitting();
    throw new PrintError('rejected');
  };
  await f.print(p);
  await settle(f);
  assert.equal((await f.service.state()).batches.at(-1).status, 'check');
});

test('lost native worker unlocks only after operator resolves the physical sheet', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  f.adapter.submit = async (_h, _c, _s, submitting) => {
    submitting();
    throw new PrintUncertainError('lost');
  };
  await f.print(p);
  await settle(f);
  assert.equal(f.printers.activity().job.status, 'uncertain');
  const s = await f.service.state();
  await f.service.resolve({ batchId: s.batches[0].id, result: 'blank' });
  assert.equal(f.printers.activity().job.status, 'failed');
  await f.print(p);
  await settle(f);
  assert.equal((await f.service.state()).batches.length, 2);
});

test('restart recovers unresolved reservations without submitting; queue and paper survive', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  await f.print(p);
  await settle(f);
  const restored = await fixture(t, f.data);
  const s = await restored.service.state();
  assert.equal(s.batches[0].status, 'check');
  assert.match(s.batches[0].message, /Interrupted/);
  assert.equal(s.queue.length, 1);
  assert.equal(s.activePaperId, p.id);
  assert.equal(restored.submissions.length, 0);
  await assert.rejects(restored.print(p), /previous/);
});

test('disk failure prevents native submission; corrupt state is not overwritten', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  f.failWrite = true;
  await assert.rejects(f.print(p), /Could not save/);
  await settle(f);
  assert.equal(f.submissions.length, 0);
  assert.equal(f.data.batches.length, 0);
  const damaged = new PaperService(
    {
      async read() {
        return { data: emptyPaperData(), issue: 'Corrupt records' };
      },
      async write() {
        assert.fail('must not overwrite');
      },
    },
    f.printers,
    () => {},
  );
  await damaged.initialize();
  await assert.rejects(
    damaged.create({ name: 'New', spec: spec() }),
    /Corrupt/,
  );
  damaged.dispose();
});

test('stale revisions, unconfirmed paper and empty layouts cannot send a job', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await assert.rejects(f.print(p), /No queued/);
  await f.add();
  await f.service.mark({ paperId: p.id, revision: 0, blocked: [] });
  await assert.rejects(f.print(p), /changed/);
  await assert.rejects(
    f.service.print({
      paperId: p.id,
      revision: 1,
      requestId: randomUUID(),
      loaded: false,
    }),
    /Confirm/,
  );
  assert.equal(f.submissions.length, 0);
});

test('a live native callback keeps sheet resolution locked until the response arrives', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  let finish;
  f.adapter.submit = async (_h, _c, _s, submitting) => {
    submitting();
    await new Promise((resolve) => {
      finish = resolve;
    });
  };
  await f.print(p);
  await settle(f);
  const s = await f.service.state();
  assert.equal(s.batches[0].status, 'sent');
  await assert.rejects(
    f.service.resolve({ batchId: s.batches[0].id, result: 'blank' }),
    /Wait/,
  );
  finish();
  await settle(f);
  assert.equal((await f.service.state()).batches[0].status, 'check');
});

test('failed outcome persistence disables sheet mutations and preserves the original reservation', async (t) => {
  const f = await fixture(t);
  const p = await f.create();
  await f.add();
  let finish;
  f.adapter.submit = async (_h, _c, _s, submitting) => {
    submitting();
    await new Promise((resolve) => {
      finish = resolve;
    });
  };
  await f.print(p);
  await settle(f);
  f.failWrite = true;
  finish();
  await settle(f);
  const s = await f.service.state();
  assert.match(s.issue, /outcome/);
  assert.equal(f.data.batches[0].status, 'sent');
  assert.equal(s.queue.length, 1);
  await assert.rejects(f.add(), /outcome/);
  await assert.rejects(f.print(p), /outcome/);
});

test('custom media are revalidated against the current matching printer profile at submission', async (t) => {
  const f = await fixture(t);
  const customPaperProfile = {
    deviceName: settings.deviceName,
    verified: true,
    minWidth: 50000,
    minHeight: 100000,
    maxWidth: 220000,
    maxHeight: 350000,
  };
  await f.printers.save({ ...settings, customPaperProfile });
  const s = await f.service.create({
    name: 'Piece',
    spec: { ...spec(), kind: 'custom' },
  });
  const p = s.papers[0];
  await f.add();
  await f.printers.save({
    ...settings,
    customPaperProfile: { ...customPaperProfile, maxHeight: 300000 },
  });
  await assert.rejects(f.print(p), /outside/);
  assert.equal(f.submissions.length, 0);
  await f.printers.save(settings);
  await assert.rejects(f.print(p), /verify/);
});

test('paper state files replace atomically, survive reopening and reject damaged versions', async (t) => {
  const root = path.resolve(import.meta.dirname, '../out');
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, 'vyora-paper-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), root);
    assert.ok(path.basename(dir).startsWith('vyora-paper-test-'));
    await rm(dir, { recursive: true });
  });
  const store = paperStateStore(dir);
  const d = emptyPaperData();
  const p = paper();
  d.papers.push(p);
  d.activePaperId = p.id;
  await store.write(d);
  d.queue = queue(2);
  await store.write(d);
  assert.deepEqual((await paperStateStore(dir).read()).data, d);
  assert.deepEqual(await readdir(dir), ['paper-state.json']);
  const filename = path.join(dir, 'paper-state.json');
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).version, 1);
  for (const text of [
    'broken',
    JSON.stringify({ version: 99, data: d }),
    'x'.repeat(2 * 1024 * 1024 + 1),
  ]) {
    await writeFile(filename, text);
    assert.match((await store.read()).issue, /disabled/);
  }
  const placements = arrangePaper(p, d.queue);
  d.batches.push({
    id: randomUUID(),
    paperId: p.id,
    status: 'check',
    message: 'Check',
    placements,
  });
  validatePaperData(d);
  d.batches.push({ ...d.batches[0], id: randomUUID() });
  assert.throws(() => validatePaperData(d), /More than one/);
});

test('native adapter uses the physical sheet size and verifies every decoded strip', async () => {
  const win = new EventEmitter();
  const wc = new EventEmitter();
  let destroyed = false,
    options,
    callback,
    script;
  win.webContents = wc;
  win.isDestroyed = () => destroyed;
  win.destroy = () => {
    destroyed = true;
    win.emit('closed');
  };
  win.loadURL = async () => {};
  wc.setWindowOpenHandler = () => {};
  wc.executeJavaScript = async (s) => {
    script = s;
    return 6;
  };
  wc.print = (o, c) => {
    options = o;
    callback = c;
  };
  const pending = submitPrintWindow(
    () => win,
    'html',
    settings,
    new AbortController().signal,
    () => {},
    { pageSize: { width: 215900, height: 330200 }, images: 6 },
  );
  await settle();
  assert.deepEqual(options.pageSize, { width: 215900, height: 330200 });
  assert.equal(options.copies, 1);
  assert.ok(script.includes('data-copy-of'));
  callback(true);
  await pending;
  assert.ok(destroyed);
});
