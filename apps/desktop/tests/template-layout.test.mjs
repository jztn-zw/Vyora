import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectPhotoSlots,
  evenlySpacedSlots,
  validateTemplate,
  adjustPhotoSlot,
  centerPhotoSlots,
  pastePhotoArea,
  matchPhotoAreaSize,
  resizePhotoAreaCount,
  fitRotatedPhotoSlot,
  normalizePhotoRotation,
  photoSlotTransform,
  rotatePhotoSlotInPlace,
  pointerRotationDelta,
} from '../src/template-layout.ts';
import { createFrameUpdates } from '../src/editor-frame-updates.ts';
import { createStripSvg } from '../src/photo-strip.ts';
import {
  emptyTemplateHistory,
  templateHistoryReducer as history,
} from '../src/template-history.ts';
import {
  clampEditorZoom,
  fitEditorFrame,
  zoomAnchorOffset,
} from '../src/editor-viewport.ts';

function pixels(kind, count = 3) {
  const width = 120,
    height = Math.max(300, count * 85 + 20);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([30, 30, 30, 255], i * 4);
  for (let index = 0; index < count; index++) {
    const top = 10 + index * 85;
    for (let y = top; y < top + 70; y++)
      for (let x = 10; x < 110; x++)
        data.set(
          kind === 'transparent' ? [0, 0, 0, 0] : [255, 255, 255, 255],
          (y * width + x) * 4,
        );
  }
  return { data, width, height };
}
function draft() {
  return {
    name: 'My wedding frame',
    width: 720,
    height: 2160,
    frame: 'data:image/png;base64,aGVsbG8=',
    slots: evenlySpacedSlots(3),
    layer: 'overlay',
  };
}

test('layout undo/redo preserves ordering, frame position and template metadata', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  const changed = {
    ...original,
    slots: [original.slots[2], original.slots[0]],
    layer: 'background',
  };
  state = history(state, { type: 'edit', update: changed });
  state = history(state, {
    type: 'edit',
    update: (current) => ({ ...current, name: 'Renamed frame' }),
  });
  assert.equal(state.past.length, 1);
  state = history(state, { type: 'undo' });
  assert.deepEqual(state.draft.slots, original.slots);
  assert.equal(state.draft.layer, 'overlay');
  assert.equal(state.draft.name, 'Renamed frame');
  assert.equal(state.draft.frame, original.frame);
  state = history(state, { type: 'redo' });
  assert.deepEqual(state.draft.slots, changed.slots);
  assert.equal(state.draft.layer, 'background');
});

test('a drag is one undo step and canceled/no-op drags preserve redo history', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, { type: 'begin' });
  for (let i = 0; i < 100; i++)
    state = history(state, {
      type: 'edit',
      update: (current) => ({
        ...current,
        slots: current.slots.map((s, index) =>
          index === 0 ? { ...s, x: i / 1000 } : s,
        ),
      }),
    });
  state = history(state, { type: 'commit' });
  assert.equal(state.past.length, 1);
  state = history(state, { type: 'undo' });
  assert.deepEqual(state.draft, original);
  state = history(state, { type: 'begin' });
  state = history(state, {
    type: 'edit',
    update: (current) => ({ ...current, slots: [] }),
  });
  state = history(state, { type: 'cancel' });
  assert.deepEqual(state.draft, original);
  assert.equal(state.future.length, 1);
  state = history(state, { type: 'begin' });
  state = history(state, { type: 'commit' });
  assert.equal(state.future.length, 1);
  state = history(state, { type: 'redo' });
  assert.equal(state.draft.slots[0].x, 0.099);
});

test('new edits discard redo; reverting the imported layout is itself undoable', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, {
    type: 'edit',
    update: { ...original, slots: evenlySpacedSlots(4) },
  });
  state = history(state, { type: 'undo' });
  state = history(state, {
    type: 'edit',
    update: { ...original, slots: evenlySpacedSlots(2) },
  });
  assert.equal(state.future.length, 0);
  state = history(state, { type: 'revert' });
  assert.deepEqual(state.draft.slots, original.slots);
  state = history(state, { type: 'undo' });
  assert.equal(state.draft.slots.length, 2);
  state = history(state, { type: 'redo' });
  assert.deepEqual(state.draft.slots, original.slots);
});

test('importing another frame resets history and its revert baseline', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, { type: 'edit', update: { ...original, slots: [] } });
  const replacement = { ...original, frame: 'new image', slots: [] };
  state = history(state, { type: 'load', draft: replacement });
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  state = history(state, { type: 'undo' });
  assert.equal(state.draft.frame, 'new image');
  state = history(state, {
    type: 'edit',
    update: { ...replacement, slots: evenlySpacedSlots(2) },
  });
  state = history(state, { type: 'revert' });
  assert.deepEqual(state.draft, replacement);
});

test('history stays bounded and undo/redo cannot interrupt an active gesture', () => {
  let state = history(emptyTemplateHistory(), { type: 'load', draft: draft() });
  for (let i = 0; i < 150; i++)
    state = history(state, {
      type: 'edit',
      update: (current) => ({
        ...current,
        layer: i % 2 ? 'overlay' : 'background',
      }),
    });
  assert.equal(state.past.length, 100);
  state = history(state, { type: 'begin' });
  assert.equal(history(state, { type: 'undo' }), state);
  assert.equal(history(state, { type: 'revert' }), state);
});

test('pasting preserves copied dimensions, leaves source unchanged and respects frame edges', () => {
  for (const source of [
    { x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
    { x: 0.6, y: 0.8, width: 0.4, height: 0.2 },
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0.02, height: 0.02 },
  ]) {
    const original = structuredClone(source);
    const input = [source];
    const result = pastePhotoArea(input, source);
    assert.equal(input.length, 1);
    assert.deepEqual(source, original);
    const pasted = result.at(-1);
    assert.notEqual(pasted, source);
    assert.equal(pasted.width, source.width);
    assert.equal(pasted.height, source.height);
    assert.ok(pasted.x >= 0 && pasted.y >= 0);
    assert.ok(pasted.x + pasted.width <= 1 && pasted.y + pasted.height <= 1);
    if (source.width < 1 && source.height < 1)
      assert.notDeepEqual(pasted, source);
  }
});

test('repeated pastes remain distinct when space allows and stop at four areas', () => {
  const source = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
  let slots = [source];
  while (slots.length < 4) slots = pastePhotoArea(slots, source);
  assert.equal(new Set(slots.map((s) => `${s.x},${s.y}`)).size, 4);
  assert.equal(pastePhotoArea(slots, source), null);
  assert.equal(slots.length, 4);
});

test('pasting and cutting are independent undoable layout edits', () => {
  const original = draft();
  const copied = { ...original.slots[0] };
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, {
    type: 'edit',
    update: { ...original, slots: original.slots.slice(1) },
  });
  state = history(state, {
    type: 'edit',
    update: (current) => ({
      ...current,
      slots: pastePhotoArea(current.slots, copied),
    }),
  });
  assert.equal(state.draft.slots.length, 3);
  const pasted = structuredClone(state.draft.slots);
  state = history(state, { type: 'undo' });
  assert.equal(state.draft.slots.length, 2);
  state = history(state, { type: 'undo' });
  assert.deepEqual(state.draft.slots, original.slots);
  state = history(state, { type: 'redo' });
  state = history(state, { type: 'redo' });
  assert.deepEqual(state.draft.slots, pasted);
});

test('pasting size onto an existing area preserves its position where possible and clamps at the edges', () => {
  const source = { x: 0, y: 0, width: 0.5, height: 0.3 };
  const inside = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 };
  assert.deepEqual(matchPhotoAreaSize(inside, source), {
    ...inside,
    width: 0.5,
    height: 0.3,
  });
  const edge = { x: 0.9, y: 0.9, width: 0.1, height: 0.1 };
  assert.deepEqual(matchPhotoAreaSize(edge, source), {
    x: 0.5,
    y: 0.7,
    width: 0.5,
    height: 0.3,
  });
  assert.equal(edge.x, 0.9);
  assert.equal(source.x, 0);
});

test('area count changes preserve edited geometry and restore imported openings when increasing', () => {
  const imported = evenlySpacedSlots(4);
  const edited = { ...imported[0], x: 0.12, width: 0.7 };
  const original = [edited, imported[1]];
  const expanded = resizePhotoAreaCount(original, 4, imported);
  assert.deepEqual(expanded, [edited, ...imported.slice(1)]);
  assert.deepEqual(original, [edited, imported[1]]);
  assert.deepEqual(resizePhotoAreaCount(expanded, 1), [edited]);
  assert.deepEqual(resizePhotoAreaCount(expanded, 0), []);
});

test('area count starter geometry stays bounded and invalid counts cannot change it', () => {
  for (const count of [1, 2, 3, 4]) {
    const slots = resizePhotoAreaCount([], count);
    assert.equal(slots.length, count);
    for (const s of slots)
      assert.ok(
        s.x >= 0 &&
          s.y >= 0 &&
          s.width > 0 &&
          s.height > 0 &&
          s.x + s.width <= 1 &&
          s.y + s.height <= 1,
      );
  }
  for (const count of [-1, 5, 2.5, NaN])
    assert.throws(() => resizePhotoAreaCount([], count), /0–4/);
});

test('reducing the area count can be undone with all previous positions restored', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, {
    type: 'edit',
    update: { ...original, slots: resizePhotoAreaCount(original.slots, 1) },
  });
  assert.equal(state.draft.slots.length, 1);
  state = history(state, { type: 'undo' });
  assert.deepEqual(state.draft.slots, original.slots);
  state = history(state, { type: 'redo' });
  assert.equal(state.draft.slots.length, 1);
});

test('tilt uses physical frame proportions and keeps every rotated corner inside the frame', () => {
  for (const [width, height] of [
    [720, 2160],
    [2160, 720],
    [720, 720],
  ]) {
    for (let rotation = -180; rotation <= 180; rotation += 15) {
      const source = { x: 0, y: 0, width: 0.12, height: 0.12, rotation };
      const fitted = fitRotatedPhotoSlot(source, width, height);
      assert.ok(fitted);
      const angle = (rotation * Math.PI) / 180;
      const cx = (fitted.x + fitted.width / 2) * width,
        cy = (fitted.y + fitted.height / 2) * height;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const dx = (sx * fitted.width * width) / 2,
            dy = (sy * fitted.height * height) / 2;
          const x = cx + dx * Math.cos(angle) - dy * Math.sin(angle),
            y = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
          assert.ok(
            x >= -1e-8 && x <= width + 1e-8 && y >= -1e-8 && y <= height + 1e-8,
          );
        }
      assert.equal(fitted.width, source.width);
      assert.equal(fitted.height, source.height);
    }
  }
  assert.equal(
    fitRotatedPhotoSlot(
      { x: 0, y: 0, width: 1, height: 1, rotation: 45 },
      720,
      2160,
    ),
    null,
  );
});

test('rotated resizing preserves the opposite corner and angle on non-square frames', () => {
  const original = { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 30 };
  const resized = adjustPhotoSlot(original, 'se', 0.04, 0.02, 2);
  function corner(s) {
    const a = (s.rotation * Math.PI) / 180,
      cx = (s.x + s.width / 2) * 2,
      cy = s.y + s.height / 2;
    const dx = -s.width,
      dy = -s.height / 2;
    return [
      cx + dx * Math.cos(a) - dy * Math.sin(a),
      cy + dx * Math.sin(a) + dy * Math.cos(a),
    ];
  }
  const before = corner(original),
    after = corner(resized);
  close(before[0], after[0]);
  close(before[1], after[1]);
  assert.equal(resized.rotation, 30);
  assert.notEqual(resized.width, original.width);
});

test('tilt persists through template validation and is rendered into exported photo strips', () => {
  const original = draft();
  const first = fitRotatedPhotoSlot(
    { ...original.slots[0], width: 0.5, height: 0.1, rotation: 15 },
    original.width,
    original.height,
  );
  const template = { ...original, slots: [first, ...original.slots.slice(1)] };
  const valid = validateTemplate(template);
  assert.equal(valid.slots[0].rotation, 15);
  const svg = createStripSvg({
    id: 'rotated',
    createdAt: '',
    template: { id: 'template', ...valid },
    photos: valid.slots.map(() => ({
      thumbnail: 'data:image/jpeg;base64,/9j/2Q==',
    })),
  });
  assert.ok(
    svg.includes(
      `transform="${photoSlotTransform(first, valid.width, valid.height)}"`,
    ),
  );
  for (const rotation of [NaN, Infinity, 181, -181, '15'])
    assert.throws(
      () =>
        validateTemplate({
          ...template,
          slots: [{ ...first, rotation }, ...template.slots.slice(1)],
        }),
      /rotation/,
    );
  const clipped = validateTemplate({
    ...template,
    slots: [
      { x: 0, y: 0, width: 1, height: 1, rotation: 45 },
      ...template.slots.slice(1),
    ],
  });
  assert.equal(clipped.slots[0].rotation, 45);
  const croppedSvg = createStripSvg({
    id: 'clipped',
    createdAt: '',
    template: { id: 'clipped', ...clipped },
    photos: [{ thumbnail: 'data:image/jpeg;base64,/9j/2Q==' }],
  });
  assert.match(croppedSvg, /<svg[^>]*overflow="hidden"/);
  assert.ok(croppedSvg.includes('rotate(45 '));
  assert.equal(normalizePhotoRotation(190), -170);
  assert.equal(normalizePhotoRotation(-190), 170);
});

test('rotation-only edits participate in undo, redo, revert, duplicate and paste-size', () => {
  const original = draft();
  let state = history(emptyTemplateHistory(), {
    type: 'load',
    draft: original,
  });
  state = history(state, { type: 'begin' });
  state = history(state, {
    type: 'edit',
    update: (current) => ({
      ...current,
      slots: current.slots.map((s, i) =>
        i === 0 ? { ...s, rotation: 15 } : s,
      ),
    }),
  });
  state = history(state, { type: 'commit' });
  assert.equal(state.past.length, 1);
  state = history(state, { type: 'undo' });
  assert.equal(state.draft.slots[0].rotation, undefined);
  state = history(state, { type: 'redo' });
  assert.equal(state.draft.slots[0].rotation, 15);
  assert.equal(
    pastePhotoArea(state.draft.slots, state.draft.slots[0]).at(-1).rotation,
    15,
  );
  assert.equal(
    matchPhotoAreaSize(original.slots[1], state.draft.slots[0]).rotation,
    15,
  );
  state = history(state, { type: 'revert' });
  assert.deepEqual(state.draft, original);
});

test('rotation continues beyond frame edges without moving or resizing the area', () => {
  const nearEdge = { x: 0.01, y: 0.2, width: 0.7, height: 0.1, rotation: 0 };
  for (const degrees of [45, 90, 135, 180, 225, 270, 360, 405, -45, -270]) {
    const rotated = rotatePhotoSlotInPlace(nearEdge, degrees);
    assert.equal(rotated.x, nearEdge.x);
    assert.equal(rotated.y, nearEdge.y);
    assert.equal(rotated.width, nearEdge.width);
    assert.equal(rotated.height, nearEdge.height);
    assert.equal(rotated.rotation, normalizePhotoRotation(degrees));
  }
});

test('rotation pointer angles cross the atan2 seam without a full-turn jump', () => {
  close(pointerRotationDelta((179 * Math.PI) / 180, (-179 * Math.PI) / 180), 2);
  close(
    pointerRotationDelta((-179 * Math.PI) / 180, (179 * Math.PI) / 180),
    -2,
  );
  const centered = { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 179 };
  const next = rotatePhotoSlotInPlace(centered, 181);
  assert.equal(next.rotation, -179);
  assert.equal(next.x, centered.x);
  assert.equal(next.y, centered.y);
});

test('pointer updates coalesce to the newest value and final flush happens before history commit', () => {
  let id = 0;
  const callbacks = new Map();
  const applied = [];
  const queue = createFrameUpdates(
    (v) => applied.push(v),
    (cb) => {
      const current = id++;
      callbacks.set(current, cb);
      return current;
    },
    (key) => callbacks.delete(key),
  );
  for (let i = 0; i < 100; i++) queue.queue(i);
  assert.equal(callbacks.size, 1);
  assert.deepEqual(applied, []);
  const first = callbacks.get(0);
  callbacks.delete(0);
  first();
  assert.deepEqual(applied, [99]);
  queue.queue(100);
  queue.queue(101);
  queue.flush();
  assert.deepEqual(applied, [99, 101]);
  assert.equal(callbacks.size, 0);
  queue.queue(102);
  queue.clear();
  assert.equal(callbacks.size, 0);
  assert.deepEqual(applied, [99, 101]);
  queue.flush();
  assert.deepEqual(applied, [99, 101]);
});

function close(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${actual} should equal ${expected}`,
  );
}

test('editor zoom stays bounded and fits tall and wide frames inside the view', () => {
  assert.equal(clampEditorZoom(0.01), 0.5);
  assert.equal(clampEditorZoom(20), 4);
  assert.equal(clampEditorZoom(1.25), 1.25);
  for (const [width, height] of [
    [720, 2160],
    [2160, 720],
    [4096, 4096],
  ]) {
    const fit = fitEditorFrame(width, height, 480, 400);
    assert.ok(fit.width <= 432 + 1e-10);
    assert.ok(fit.height <= 352 + 1e-10);
    close(fit.width / fit.height, width / height);
  }
});

test('zoom scroll correction preserves the image point under the cursor', () => {
  for (const scale of [0.5, 1.25, 4]) {
    const oldOrigin = 90,
      oldSize = 300,
      cursor = 230;
    const fraction = (cursor - oldOrigin) / oldSize;
    const newOrigin = 24,
      newSize = oldSize * scale;
    const correction = zoomAnchorOffset(newOrigin, newSize, fraction, cursor);
    close(newOrigin - correction + fraction * newSize, cursor);
  }
});

test('corner and edge resizing keeps the opposite edges anchored', () => {
  const slot = { x: 0.2, y: 0.2, width: 0.5, height: 0.3 };
  for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const resized = adjustPhotoSlot(slot, handle, 0.05, 0.08);
    if (handle.includes('w')) close(resized.x + resized.width, 0.7);
    else close(resized.x, slot.x);
    if (handle.includes('n')) close(resized.y + resized.height, 0.5);
    else close(resized.y, slot.y);
    if (!handle.includes('w') && !handle.includes('e'))
      close(resized.width, slot.width);
    if (!handle.includes('n') && !handle.includes('s'))
      close(resized.height, slot.height);
    assert.notDeepEqual(resized, slot);
  }
  assert.deepEqual(slot, { x: 0.2, y: 0.2, width: 0.5, height: 0.3 });
});

test('resizing cannot cross the opposite edge or escape the template', () => {
  const value = draft();
  for (const handle of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    for (const delta of [-10, 10]) {
      const slot = value.slots[0];
      const resized = adjustPhotoSlot(slot, handle, delta, delta);
      assert.ok(resized.width >= 0.02 && resized.height >= 0.02);
      validateTemplate({ ...value, slots: [resized, ...value.slots.slice(1)] });
      if (handle.includes('w'))
        close(resized.x + resized.width, slot.x + slot.width);
      if (handle.includes('n'))
        close(resized.y + resized.height, slot.y + slot.height);
    }
  }
});

test('moving clamps to all four boundaries without changing photo size', () => {
  const slot = { x: 0.2, y: 0.3, width: 0.5, height: 0.2 };
  assert.deepEqual(adjustPhotoSlot(slot, 'move', -10, -10), {
    ...slot,
    x: 0,
    y: 0,
  });
  assert.deepEqual(adjustPhotoSlot(slot, 'move', 10, 10), {
    ...slot,
    x: 0.5,
    y: 0.8,
  });
  assert.deepEqual(adjustPhotoSlot(slot, 'move', NaN, 0), slot);
});

test('centering one or all areas preserves their sizes, rows and capture order', () => {
  const slots = [
    { x: 0.1, y: 0.04, width: 0.6, height: 0.2 },
    { x: 0.45, y: 0.3, width: 0.4, height: 0.25 },
    { x: 0.05, y: 0.6, width: 0.8, height: 0.25 },
  ];
  const original = structuredClone(slots);
  const single = centerPhotoSlots(slots, 1);
  assert.deepEqual(single[0], slots[0]);
  assert.deepEqual(single[2], slots[2]);
  for (const [index, area] of centerPhotoSlots(slots).entries()) {
    close(area.x + area.width / 2, 0.5);
    assert.equal(area.y, slots[index].y);
    assert.equal(area.width, slots[index].width);
    assert.equal(area.height, slots[index].height);
  }
  close(single[1].x + single[1].width / 2, 0.5);
  assert.deepEqual(slots, original);
  validateTemplate({ ...draft(), slots: centerPhotoSlots(slots) });
});

test('PNG transparent openings are detected in capture order', () => {
  const { data, width, height } = pixels('transparent');
  const result = detectPhotoSlots(data, width, height);
  assert.equal(result.detected, true);
  assert.equal(result.layer, 'overlay');
  assert.equal(result.slots.length, 3);
  assert.equal(result.slots[0].x, 10 / width);
  assert.equal(result.slots[0].height, 70 / height);
  assert.ok(result.slots[2].y > result.slots[1].y);
});

test('opaque JPEG-style white photo boxes use a background frame', () => {
  const { data, width, height } = pixels('white');
  const result = detectPhotoSlots(data, width, height);
  assert.equal(result.layer, 'background');
  assert.equal(result.slots.length, 3);
});

test('a transparent or white outside border is not a photo area', () => {
  for (const value of [0, 255]) {
    const data = new Uint8ClampedArray(100 * 200 * 4).fill(value);
    assert.equal(detectPhotoSlots(data, 100, 200).detected, false);
  }
  assert.throws(() => detectPhotoSlots(new Uint8ClampedArray(1), 100, 100));
});

test('frames with extra openings require manual placement and preserve the frame position', () => {
  for (const [kind, layer, count] of [
    ['transparent', 'overlay', 5],
    ['white', 'background', 6],
  ]) {
    const { data, width, height } = pixels(kind, count);
    const result = detectPhotoSlots(data, width, height);
    assert.equal(result.excessOpenings, count);
    assert.equal(result.layer, layer);
    assert.equal(result.detected, false);
    assert.deepEqual(result.slots, []);
  }
});

test('template validation rejects executable assets, invalid sizes and out-of-bounds slots', () => {
  assert.equal(validateTemplate(draft()).slots.length, 3);
  for (const update of [
    { frame: 'https://example.com/frame.png' },
    { frame: 'data:image/svg+xml,<svg/>' },
    { width: 10000 },
    { slots: [] },
    { slots: evenlySpacedSlots(5) },
    {
      slots: [
        { x: 0.9, y: 0, width: 0.5, height: 0.2 },
        ...evenlySpacedSlots(2),
      ],
    },
    {
      slots: [
        { x: NaN, y: 0, width: 0.5, height: 0.2 },
        ...evenlySpacedSlots(2),
      ],
    },
  ])
    assert.throws(() => validateTemplate({ ...draft(), ...update }));
});

test('custom strip output uses the template size, slots, crop and layer order', () => {
  const template = { id: 'template', ...draft() };
  const photos = [0, 1, 2].map((index) => ({
    id: String(index),
    thumbnail: 'data:image/jpeg;base64,/9j/2Q==',
    width: 600,
    height: 400,
    createdAt: '',
  }));
  const strip = { id: 'strip', createdAt: '', photos, template };
  const overlay = createStripSvg(strip);
  assert.match(overlay, /viewBox="0 0 720 2160"/);
  assert.equal((overlay.match(/data-slot=/g) || []).length, 3);
  assert.match(overlay, /preserveAspectRatio="xMidYMid slice"/);
  assert.ok(
    overlay.indexOf('data-layer="frame"') > overlay.indexOf('data-slot="3"'),
  );
  const background = createStripSvg({
    ...strip,
    template: { ...template, layer: 'background' },
  });
  assert.ok(
    background.indexOf('data-layer="frame"') <
      background.indexOf('data-slot="1"'),
  );
  assert.equal(
    (
      createStripSvg({ ...strip, photos: photos.slice(0, 1) }).match(
        /data-slot=/g,
      ) || []
    ).length,
    3,
    'Partial sessions preserve the chosen template layout',
  );
  assert.throws(() =>
    createStripSvg({ ...strip, photos: [...photos, photos[0]] }),
  );
});
