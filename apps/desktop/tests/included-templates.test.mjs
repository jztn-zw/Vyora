import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createIncludedTemplates } from '../src/storage/included-templates.ts';
import { createTemplateStore } from '../src/storage/templates.ts';
import { createSessionBuffer } from '../src/storage/session-buffer.ts';
import { createStripSvg } from '../src/photo-strip.ts';
import {
  frameChoiceId,
  frameChoiceName,
  groupFrameChoices,
  normalizeFrameChoices,
  resolveFrameChoice,
} from '../src/frame-choices.ts';

const directory = fileURLToPath(
  new URL('../assets/free-frames/', import.meta.url),
);
const collection = createIncludedTemplates(directory);

test('the picker groups count variants into seven stable choices and switches their previews', () => {
  const templates = collection.list();
  const ids = groupFrameChoices(templates, 2).map((choice) => choice.id);
  for (const count of [2, 3, 4]) {
    const choices = groupFrameChoices(templates, count);
    assert.equal(choices.length, 7);
    assert.deepEqual(
      choices.map((choice) => choice.id),
      ids,
    );
    for (const choice of choices) {
      assert.equal(choice.template.slots.length, count);
      assert.equal(choice.template.id, `${choice.id}-${count}`);
      assert.doesNotMatch(choice.name, /· [234] photos/);
      assert.equal(frameChoiceId(choice.template), choice.id);
      assert.equal(frameChoiceName(choice.template), choice.name);
      assert.equal(
        resolveFrameChoice(templates, choice.id, count).preview,
        choice.template.preview,
      );
    }
  }
});

test('saved variants migrate to four-photo choices and short custom imports are excluded', () => {
  const templates = collection.list();
  const custom = {
    ...templates[0],
    id: 'my-import',
    name: 'My 2 photos',
    builtIn: undefined,
  };
  const all = [...templates, custom];
  assert.deepEqual(
    normalizeFrameChoices(
      [
        '',
        'vyora-free-film-2',
        'vyora-free-film-4',
        'vyora-free-neon',
        'my-import',
        'missing',
        null,
      ],
      all,
    ),
    ['', 'vyora-free-film', 'vyora-free-neon'],
  );
  assert.equal(groupFrameChoices(all, 4).length, 7);
  assert.equal(frameChoiceName(custom), custom.name);
  assert.equal(resolveFrameChoice(all, 'my-import', 4), undefined);
  assert.equal(resolveFrameChoice(all, 'missing', 2), undefined);
});

test('selecting another count resolves a concrete asset with exactly that capture limit', () => {
  const templates = collection.list();
  const family = 'vyora-free-urban-pop';
  for (const count of [4, 2, 3]) {
    // An old stored variant ID must also resolve to the requested count.
    const choice = resolveFrameChoice(templates, `${family}-4`, count);
    assert.equal(choice.id, `${family}-${count}`);
    const actual = collection.get(choice.id);
    assert.equal(actual.slots.length, count);
    assert.equal(frameChoiceId(actual), family);
  }
});

test('seven included designs each provide exactly 2-, 3- and 4-photo versions', () => {
  const frames = collection.list();
  assert.equal(frames.length, 21);
  const families = new Map();
  for (const frame of frames) {
    assert.equal(frame.builtIn, true);
    assert.equal(frame.layer, 'overlay');
    assert.match(frame.preview, /^data:image\/png;base64,/);
    assert.doesNotMatch(frame.name, /instagram/i);
    assert.equal(frame.slots.length, Number(frame.id.slice(-1)));
    const family = frame.id.slice(0, -2);
    families.set(family, [...(families.get(family) ?? []), frame.slots.length]);
  }
  assert.equal(families.size, 7);
  for (const counts of families.values()) assert.deepEqual(counts, [2, 3, 4]);
});

test('full artwork dimensions and ordered photo areas are valid for all 21 exports', () => {
  for (const summary of collection.list()) {
    const template = collection.get(summary.id);
    const png = Buffer.from(template.frame.split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), template.width);
    assert.equal(png.readUInt32BE(20), template.height);
    assert.ok(template.width >= 600 && template.height >= 1500);
    assert.equal(template.slots.length, summary.slots.length);
    const photos = template.slots.map((_, index) => ({
      id: String(index),
      createdAt: '',
      width: 1280,
      height: 720,
      thumbnail: 'data:image/jpeg;base64,/9j/2Q==',
    }));
    const svg = createStripSvg({ id: 'test', createdAt: '', template, photos });
    assert.equal((svg.match(/data-slot="/g) ?? []).length, photos.length);
    assert.ok(svg.includes(template.frame));
    assert.ok(
      template.slots.every(
        (slot, i) => i === 0 || slot.y > template.slots[i - 1].y,
      ),
    );
  }
});

test('original-count artwork is preserved byte for byte', () => {
  const provenance = JSON.parse(
    readFileSync(path.join(directory, 'provenance.json'), 'utf8'),
  );
  for (const source of provenance.originals) {
    const actual = createHash('sha256')
      .update(readFileSync(path.join(directory, source.file)))
      .digest('hex');
    assert.equal(actual, source.sha256, source.file);
  }
  assert.equal(provenance.originals.length, 6);
});

test('picker summaries are defensive copies and asset IDs cannot read arbitrary paths', () => {
  const frames = collection.list();
  frames[0].slots[0].x = 999;
  frames.pop();
  assert.equal(collection.list().length, 21);
  assert.ok(collection.list()[0].slots[0].x < 1);
  for (const id of [
    '../outside',
    'vyora-free-film-1',
    'vyora-free-film-5',
    '/etc/passwd',
  ]) {
    assert.equal(collection.get(id), undefined);
    assert.equal(collection.has(id), false);
  }
});

test('free frames coexist with the custom library and cannot be edited or removed', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE templates (id TEXT, name TEXT, width INTEGER, height INTEGER, slots_json TEXT, layer TEXT, thumbnail TEXT)',
    );
    db.prepare('INSERT INTO templates VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'custom',
      'My frame',
      720,
      2160,
      JSON.stringify(collection.list()[0].slots),
      'overlay',
      'thumbnail',
    );
    const store = createTemplateStore(db, directory, collection);
    assert.equal(store.list().length, 22);
    assert.equal(store.list().at(-1).name, 'My frame');
    for (const summary of collection.list()) {
      const original = store.get(summary.id);
      assert.throws(
        () => store.update(summary.id, { ...original, name: 'Changed' }),
        /cannot be overwritten/,
      );
      assert.throws(() => store.remove(summary.id), /cannot be removed/);
      assert.equal(store.get(summary.id).name, summary.name);
    }
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM templates').get().count,
      1,
    );
  } finally {
    db.close();
  }
});

test('each included variant drives the correct capture limit and preserves its frame', () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  for (const summary of collection.list()) {
    const captures = createSessionBuffer();
    const template = collection.get(summary.id);
    for (let i = 0; i < template.slots.length; i++)
      captures.stage(
        id,
        Buffer.from('photo'),
        { width: 1280, height: 720 },
        '',
        template,
      );
    assert.throws(() =>
      captures.stage(
        id,
        Buffer.from('extra'),
        { width: 1280, height: 720 },
        '',
        template,
      ),
    );
    assert.equal(captures.pending().photos.length, template.slots.length);
    assert.equal(captures.read(id).template.id, template.id);
    captures.clear(id);
    assert.equal(captures.pending(), undefined);
  }
});
