import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DigiCamBridge } from '../src/tethered-bridge.ts';

const jpeg = new Uint8Array([255, 216, 10, 20, 255, 217]);
function connector() {
  const state = {
    serial: 'camera-1',
    shutters: 0,
    reads: [],
    token: '',
    stale: false,
    fail: false,
    huge: false,
    hold: null,
  };
  const bridge = new DigiCamBridge(async (address, options) => {
    const url = new URL(address);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    state.reads.push(url);
    const query = url.searchParams;
    if (query.get('slc') === 'capture') {
      state.shutters++;
      state.token = query.get('param1');
      assert.equal(query.get('camera'), state.serial);
      if (state.hold) await state.hold;
      if (state.fail) throw new TypeError('Disconnected after shutter');
      return new Response('OK');
    }
    if (query.get('param1') === 'camera') return new Response(state.serial);
    if (query.get('param1') === 'property.devicename')
      return new Response('Fixture camera');
    if (query.get('param1') === 'lastcaptured') {
      if (state.stale) {
        state.stale = false;
        return new Response('C:\\photos\\old.jpg');
      }
      return new Response(`C:\\photos\\${state.token}.jpg`);
    }
    if (url.pathname.startsWith('/image/')) {
      assert.equal(
        url.pathname,
        `/image/${state.token}.jpg`,
        'Never download an unrelated prior image',
      );
      return new Response(
        jpeg,
        state.huge ? { headers: { 'content-length': '22000000' } } : undefined,
      );
    }
    if (url.pathname === '/liveview.jpg') return new Response(jpeg);
    return new Response('OK');
  });
  return { bridge, state };
}

test('correlates the shutter JPEG, rejects stale photos, and deduplicates requests', async () => {
  const { bridge, state } = connector();
  const info = await bridge.connect(5513);
  await bridge.startPreview(5513);
  await bridge.preview(5513);
  state.stale = true;
  const id = randomUUID();
  const first = bridge.capture(5513, info.serial, id, 0);
  assert.equal(bridge.capture(5513, info.serial, id, 0), first);
  assert.deepEqual(new Uint8Array(await first), jpeg);
  assert.equal(state.shutters, 1);
  assert.deepEqual(await bridge.capture(5513, info.serial, id, 0), await first);
  await bridge.capture(5513, info.serial, randomUUID(), 0);
  await assert.rejects(
    bridge.capture(5513, info.serial, id, 0),
    /already finished/,
  );
  assert.equal(state.shutters, 2);
  assert.equal(
    state.reads.filter((url) => url.pathname === '/image/old.jpg').length,
    0,
  );
});

test('an interrupted shutter is never retried and requires deliberate reconnection', async () => {
  const { bridge, state } = connector();
  await bridge.connect(5513);
  state.fail = true;
  const id = randomUUID();
  await assert.rejects(
    bridge.capture(5513, state.serial, id, 0),
    /interrupted/,
  );
  await assert.rejects(
    bridge.capture(5513, state.serial, id, 0),
    /interrupted/,
  );
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), 0),
    /uncertain/,
  );
  assert.equal(state.shutters, 1);
  state.fail = false;
  await bridge.connect(5513);
  await bridge.capture(5513, state.serial, randomUUID(), 0);
  assert.equal(state.shutters, 2);
});

test('serializes exposures and refuses a reconnect while a shutter transfer is pending', async () => {
  const { bridge, state } = connector();
  await bridge.connect(5513);
  let finish;
  state.hold = new Promise((resolve) => {
    finish = resolve;
  });
  const pending = bridge.capture(5513, state.serial, randomUUID(), 0);
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), 0),
    /busy/,
  );
  await assert.rejects(bridge.connect(5513), /still running/);
  finish();
  await pending;
  assert.equal(state.shutters, 1);
});

test('validates the port, settings and selected camera before any shutter', async () => {
  const { bridge, state } = connector();
  await assert.rejects(bridge.connect(80), /connector port/);
  await bridge.connect(5513);
  await assert.rejects(
    bridge.capture(5514, state.serial, randomUUID(), 0),
    /Reconnect/,
  );
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), -1),
    /Invalid/,
  );
  state.serial = 'camera-2';
  await assert.rejects(
    bridge.capture(5513, 'camera-1', randomUUID(), 0),
    /camera changed/,
  );
  assert.equal(state.shutters, 0);
});

test('enforces flash recovery without sending an early shutter', async () => {
  const { bridge, state } = connector();
  await bridge.connect(5513);
  await bridge.capture(5513, state.serial, randomUUID(), 10000);
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), 10000),
    /recovery interval/,
  );
  assert.equal(state.shutters, 1);
});

test('rejects oversized originals and locks an ambiguous capture', async () => {
  const { bridge, state } = connector();
  await bridge.connect(5513);
  state.huge = true;
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), 0),
    /too large/,
  );
  await assert.rejects(
    bridge.capture(5513, state.serial, randomUUID(), 0),
    /uncertain/,
  );
  assert.equal(state.shutters, 1);
});
