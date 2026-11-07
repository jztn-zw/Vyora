import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSessionBuffer } from '../src/storage/session-buffer.ts';
import { retakeTargets } from '../src/capture-review.ts';
import { createStripSvg } from '../src/photo-strip.ts';
import { evenlySpacedSlots } from '../src/template-layout.ts';

function session(count = 4) {
  const buffer = createSessionBuffer();
  const id = randomUUID();
  const template = {
    id: randomUUID(),
    name: 'Retake test',
    width: 200,
    height: 600,
    frame: 'data:image/png;base64,aGVsbG8=',
    layer: 'overlay',
    slots: Array.from({ length: count }, (_, index) => ({
      x: 0.1,
      y: index / count,
      width: 0.8,
      height: 0.2,
    })),
  };
  for (let i = 0; i < count; i++)
    buffer.stage(
      id,
      Buffer.from(`original-${i}`),
      { width: 640, height: 480 },
      `thumb-${i}`,
      template,
    );
  return { buffer, id, template };
}

test('choosing photos 3 and 1 replaces only those positions in capture order', () => {
  const { buffer, id, template } = session();
  const original = buffer.read(id);
  const choices = [original.photos[2].id, original.photos[0].id];
  const targets = retakeTargets(original, choices);
  assert.deepEqual(
    targets.map((target) => target.index),
    [0, 2],
  );
  for (const target of targets)
    buffer.replace(
      id,
      target.photoId,
      Buffer.from(`replacement-${target.index}`),
      { width: 1280, height: 720 },
      `new-${target.index}`,
    );
  const updated = buffer.read(id);
  assert.equal(updated.photos.length, 4);
  assert.deepEqual(
    updated.photos.map((photo) => photo.id),
    original.photos.map((photo) => photo.id),
  );
  assert.equal(updated.createdAt, original.createdAt);
  assert.deepEqual(updated.template, template);
  for (const index of [1, 3])
    assert.deepEqual(updated.photos[index], original.photos[index]);
  for (const index of [0, 2]) {
    assert.equal(
      updated.photos[index].thumbnail,
      `data:image/jpeg;base64,${Buffer.from(`replacement-${index}`).toString('base64')}`,
    );
    assert.equal(updated.photos[index].width, 1280);
    assert.equal(buffer.pending().photos[index].thumbnail, `new-${index}`);
  }
});

test('per-area positions survive pending recovery and source reads without modifying originals', () => {
  const { buffer, id } = session();
  const before = buffer.read(id);
  buffer.setCrop(id, 0, { x: 0, y: 0.7, zoom: 2 });
  buffer.setCrop(id, 1, { x: 1, y: 0, zoom: 1.2 });
  const recovered = buffer.pending();
  assert.deepEqual(recovered.photoCrops[0], { x: 0, y: 0.7, zoom: 2 });
  assert.deepEqual(buffer.read(id).photoCrops, recovered.photoCrops);
  assert.deepEqual(buffer.read(id).photos, before.photos);
  recovered.photoCrops[0].x = 1;
  assert.equal(
    buffer.pending().photoCrops[0].x,
    0,
    'callers cannot mutate the buffer',
  );
  buffer.replace(
    id,
    before.photos[0].id,
    Buffer.from('retake'),
    { width: 640, height: 480 },
    'new',
  );
  assert.deepEqual(buffer.pending().photoCrops[0], { x: 0.5, y: 0.5, zoom: 1 });
  assert.deepEqual(buffer.pending().photoCrops[1], { x: 1, y: 0, zoom: 1.2 });
  assert.throws(() => buffer.setCrop(randomUUID(), 0, { x: 0, y: 0, zoom: 1 }));
  assert.throws(() => buffer.setCrop(id, 4, { x: 0, y: 0, zoom: 1 }));
  assert.throws(() => buffer.setCrop(id, 0, { x: 0, y: 0, zoom: Infinity }));
  buffer.clear(id);
  assert.throws(() => buffer.setCrop(id, 0, { x: 0, y: 0, zoom: 1 }));
});

test('linked areas have independent crops and retaking their shared photo resets both positions', () => {
  const buffer = createSessionBuffer();
  const id = randomUUID();
  const template = {
    id: randomUUID(),
    name: 'Linked frame',
    width: 200,
    height: 600,
    frame: 'data:image/png;base64,aGVsbG8=',
    layer: 'overlay',
    slots: [0.05, 0.55].map((y) => ({
      x: 0.1,
      y,
      width: 0.8,
      height: 0.4,
      photoIndex: 0,
    })),
  };
  const record = buffer.stage(
    id,
    Buffer.from('photo'),
    { width: 640, height: 480 },
    'thumb',
    template,
  );
  buffer.setCrop(id, 0, { x: 0, y: 0, zoom: 1.5 });
  buffer.setCrop(id, 1, { x: 1, y: 1, zoom: 2 });
  const svg = createStripSvg(buffer.read(id));
  assert.equal((svg.match(/data-slot=/g) || []).length, 2);
  assert.match(svg, /x="0" y="0" width="480" height="360"/);
  assert.match(svg, /x="-480" y="-240" width="640" height="480"/);
  buffer.replace(
    id,
    record.id,
    Buffer.from('replacement'),
    { width: 640, height: 480 },
    'new',
  );
  assert.deepEqual(buffer.pending().photoCrops, [
    { x: 0.5, y: 0.5, zoom: 1 },
    { x: 0.5, y: 0.5, zoom: 1 },
  ]);
});

test('fifteen areas can share one capture, and a retake updates all linked areas', () => {
  const buffer = createSessionBuffer();
  const id = randomUUID();
  const template = {
    id: randomUUID(),
    name: 'Repeated portrait',
    width: 720,
    height: 2160,
    frame: 'data:image/png;base64,aGVsbG8=',
    layer: 'overlay',
    slots: evenlySpacedSlots(15).map((slot) => ({ ...slot, photoIndex: 0 })),
  };
  const photo = buffer.stage(
    id,
    Buffer.from('first'),
    { width: 640, height: 480 },
    'thumb',
    template,
  );
  assert.equal(buffer.pending().photos.length, 1);
  assert.throws(() =>
    buffer.stage(
      id,
      Buffer.from('extra'),
      { width: 640, height: 480 },
      'thumb',
      template,
    ),
  );
  buffer.replace(
    id,
    photo.id,
    Buffer.from('retake'),
    { width: 640, height: 480 },
    'new',
  );
  const updated = buffer.read(id);
  const source = updated.photos[0].thumbnail;
  assert.equal(
    createStripSvg(updated).split(`href="${source}"`).length - 1,
    15,
  );
});

test('a fifteen-capture frame stores all photos and bounds additional captures', () => {
  const { buffer, id, template } = session(15);
  assert.equal(buffer.read(id).photos.length, 15);
  assert.throws(() =>
    buffer.stage(
      id,
      Buffer.from('extra'),
      { width: 640, height: 480 },
      'thumb',
      template,
    ),
  );
  assert.equal(
    retakeTargets(
      buffer.read(id),
      buffer.read(id).photos.map((photo) => photo.id),
    ).length,
    15,
  );
});

test('retakes can be repeated and a stopped batch keeps all remaining originals', () => {
  const { buffer, id } = session(3);
  const original = buffer.read(id);
  const targets = retakeTargets(
    original,
    original.photos.map((photo) => photo.id),
  );
  // Simulate stopping after the first replacement, before the next countdown.
  buffer.replace(
    id,
    targets[0].photoId,
    Buffer.from('first'),
    { width: 320, height: 240 },
    'first',
  );
  assert.deepEqual(buffer.read(id).photos.slice(1), original.photos.slice(1));
  buffer.replace(
    id,
    targets[0].photoId,
    Buffer.from('second'),
    { width: 320, height: 240 },
    'second',
  );
  assert.equal(buffer.pending().photos[0].thumbnail, 'second');
  assert.equal(buffer.read(id).photos.length, 3);
  assert.deepEqual(buffer.read(id).photos.slice(1), original.photos.slice(1));
});

test('a single photo or every photo can be retaken in two-, three-, and four-photo sessions', () => {
  for (const count of [2, 3, 4]) {
    const { buffer, id } = session(count);
    const original = buffer.read(id);
    const one = retakeTargets(original, [original.photos[count - 1].id]);
    assert.equal(one.length, 1);
    buffer.replace(
      id,
      one[0].photoId,
      Buffer.from('single'),
      { width: 800, height: 600 },
      'single',
    );
    assert.deepEqual(
      buffer.read(id).photos.slice(0, -1),
      original.photos.slice(0, -1),
    );
    for (const target of retakeTargets(
      buffer.read(id),
      original.photos.map((photo) => photo.id),
    ))
      buffer.replace(
        id,
        target.photoId,
        Buffer.from(`all-${target.index}`),
        { width: 800, height: 600 },
        `all-${target.index}`,
      );
    assert.deepEqual(
      buffer.pending().photos.map((photo) => photo.thumbnail),
      Array.from({ length: count }, (_, i) => `all-${i}`),
    );
  }
});

test('invalid, duplicate and stale selections cannot modify the unsaved session', () => {
  const { buffer, id } = session(2);
  const original = buffer.read(id);
  for (const ids of [
    [],
    [randomUUID()],
    [original.photos[0].id, original.photos[0].id],
  ])
    assert.throws(() => retakeTargets(original, ids));
  for (const [sessionId, photoId] of [
    [randomUUID(), original.photos[0].id],
    [id, randomUUID()],
    ['../outside', original.photos[0].id],
  ])
    assert.throws(() =>
      buffer.replace(
        sessionId,
        photoId,
        Buffer.from('bad'),
        { width: 1, height: 1 },
        'bad',
      ),
    );
  assert.deepEqual(buffer.read(id), original);
  buffer.clear(id);
  assert.throws(() =>
    buffer.replace(
      id,
      original.photos[0].id,
      Buffer.from('late'),
      { width: 1, height: 1 },
      'late',
    ),
  );
  assert.equal(buffer.pending(), undefined);
});
