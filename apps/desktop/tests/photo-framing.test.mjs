import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureFrameRect,
  photoPlacement,
  photoVisibleRect,
  validatePhotoCrop,
} from '../src/photo-framing.ts';

test('a wide capture shows the exact narrower region used by a portrait opening', () => {
  const area = { photoIndex: 0, width: 300, height: 400 };
  assert.deepEqual(photoPlacement(1600, 900, 300, 400), {
    x: (300 - (1600 * 4) / 9) / 2,
    y: 0,
    width: (1600 * 4) / 9,
    height: 400,
  });
  const rect = captureFrameRect(1600, 900, [area], 0);
  assert.ok(Math.abs(rect.x - 0.2890625) < 0.000001);
  assert.ok(Math.abs(rect.width - 0.421875) < 0.000001);
  assert.equal(rect.y, 0);
  assert.equal(rect.height, 1);
});

test('linked landscape and portrait areas use a common safe region without changing their source', () => {
  const areas = [
    { photoIndex: 0, width: 300, height: 400 },
    { photoIndex: 0, width: 400, height: 100 },
    { photoIndex: 1, width: 10, height: 100 },
  ];
  const result = captureFrameRect(1600, 900, areas, 0);
  assert.ok(Math.abs(result.width - 0.421875) < 0.000001);
  assert.ok(Math.abs(result.height - 4 / 9) < 0.000001);
  assert.ok(result.x > 0 && result.y > 0);
  assert.deepEqual(
    areas.map((area) => area.photoIndex),
    [0, 0, 1],
  );
});

test('dragging to an edge can recover off-center people without exposing empty space', () => {
  for (const [width, height] of [
    [1600, 900],
    [900, 1600],
    [1000, 1000],
  ]) {
    for (const x of [0, 0.5, 1])
      for (const y of [0, 0.5, 1])
        for (const zoom of [1, 1.5, 3]) {
          const area = {
            photoIndex: 0,
            width: 300,
            height: 400,
            crop: { x, y, zoom },
          };
          const fit = photoPlacement(
            width,
            height,
            area.width,
            area.height,
            area.crop,
          );
          assert.ok(fit.x <= 0 && fit.y <= 0);
          assert.ok(fit.x + fit.width >= area.width - 0.000001);
          assert.ok(fit.y + fit.height >= area.height - 0.000001);
          const visible = photoVisibleRect(width, height, area);
          assert.ok(visible.x >= 0 && visible.y >= 0);
          assert.ok(visible.x + visible.width <= 1.000001);
          assert.ok(visible.y + visible.height <= 1.000001);
        }
  }
  assert.equal(
    photoVisibleRect(1600, 900, {
      photoIndex: 0,
      width: 300,
      height: 400,
      crop: { x: 0, y: 0.5, zoom: 1 },
    }).x,
    0,
  );
});

test('non-finite, out-of-bounds and malformed crop payloads are rejected', () => {
  for (const value of [
    null,
    {},
    { x: -1, y: 0.5, zoom: 1 },
    { x: 0.5, y: 2, zoom: 1 },
    { x: NaN, y: 0, zoom: 1 },
    { x: 0, y: Infinity, zoom: 1 },
    { x: 0, y: 0, zoom: 0.9 },
    { x: 0, y: 0, zoom: 3.1 },
    { x: '0', y: 0, zoom: 1 },
  ])
    assert.throws(() => validatePhotoCrop(value));
  assert.deepEqual(
    validatePhotoCrop({ x: 0, y: 1, zoom: 3, unexpected: 'ignored' }),
    { x: 0, y: 1, zoom: 3 },
  );
});
