import assert from 'node:assert/strict';
import { test } from 'node:test';
import brand from '../src/strip-brand.json' with { type: 'json' };
import {
  createStripSvg,
  stripHeight,
  stripPreviewUrl,
} from '../src/photo-strip.ts';

function sample(count) {
  return {
    id: 'test-strip',
    createdAt: '2026-10-31T08:00:00Z',
    photos: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      thumbnail: '',
      width: 600,
      height: 394,
    })),
  };
}

test('one to four shots produce complete strips with a VYORA footer', () => {
  for (const count of [1, 2, 3, 4]) {
    const svg = createStripSvg(sample(count));
    assert.match(svg, /VYORA/);
    assert.match(svg, new RegExp(`height="${stripHeight(count)}"`));
    assert.equal(
      (svg.match(/width="600" height="394" fill="white"/g) || []).length,
      count,
    );
    assert.match(stripPreviewUrl(sample(count)), /^data:image\/svg\+xml/);
  }
});

test('invalid photo counts cannot create empty or oversized strips', () => {
  for (const count of [0, 16, -1, 2.5]) assert.throws(() => stripHeight(count));
});

test('the strip embeds the original emblem and wordmark instead of substitute lettering', () => {
  const svg = createStripSvg(sample(4));
  assert.ok(svg.includes(`href="${brand.wordmark}"`));
  assert.ok(svg.includes(`href="${brand.symbol}"`));
  assert.match(svg, /data-brand="original-vyora-wordmark"/);
  assert.doesNotMatch(svg, /<text\b[^>]*>VYORA<\/text>/);
  assert.deepEqual(brand.crops.wordmark, [379, 744, 226, 65]);
  assert.deepEqual(brand.crops.symbol, [409, 588, 191, 157]);
  assert.equal(stripHeight(4), 2048);
});

test('only embedded raster images enter the generated strip', () => {
  const strip = sample(2);
  strip.photos[0].thumbnail = 'https://example.com/track.jpg';
  assert.throws(() => createStripSvg(strip), /invalid photo/);
  strip.photos[0].thumbnail = 'data:image/svg+xml,<svg onload="alert(1)"/>';
  assert.throws(() => createStripSvg(strip), /invalid photo/);
  strip.photos[0].thumbnail = 'data:image/jpeg;base64,/9j/2Q==';
  assert.match(createStripSvg(strip), /preserveAspectRatio="xMidYMid slice"/);
});
