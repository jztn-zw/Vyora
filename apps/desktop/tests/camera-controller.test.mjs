import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CameraController } from '../src/camera-controller.ts';
import { CAMERA_KEY } from '../src/camera.ts';

const phone = { kind: 'videoinput', deviceId: 'phone', label: 'Camo' };
const webcam = { kind: 'videoinput', deviceId: 'webcam', label: 'HD Webcam' };
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function makeStream(device = phone) {
  const track = Object.assign(new EventTarget(), {
    label: device.label,
    readyState: 'live',
    muted: false,
    enabled: true,
    stopped: false,
    getSettings: () => ({
      deviceId: device.deviceId,
      width: 1920,
      height: 1080,
    }),
    stop() {
      this.stopped = true;
      this.readyState = 'ended';
    },
    end() {
      this.readyState = 'ended';
      this.dispatchEvent(new Event('ended'));
    },
    mute() {
      this.muted = true;
      this.dispatchEvent(new Event('mute'));
    },
    unmute() {
      this.muted = false;
      this.dispatchEvent(new Event('unmute'));
    },
  });
  return { track, getVideoTracks: () => [track], getTracks: () => [track] };
}

function fixture(t, saved = null) {
  const values = new Map(saved ? [[CAMERA_KEY, JSON.stringify(saved)]] : []);
  const video = Object.assign(new EventTarget(), {
    readyState: 2,
    videoWidth: 1920,
    videoHeight: 1080,
    paused: false,
    srcObject: null,
    play: async () => {},
  });
  const result = {
    video,
    values,
    sources: [webcam, phone],
    requests: [],
    streams: [],
    interruptions: 0,
  };
  const devices = {
    async enumerateDevices() {
      return result.sources;
    },
    async getUserMedia(constraints) {
      result.requests.push(constraints);
      const id = constraints.video.deviceId?.exact;
      const source = id
        ? result.sources.find((device) => device.deviceId === id)
        : result.sources[0];
      if (!source) throw new DOMException('Missing', 'NotFoundError');
      const media = makeStream(source);
      result.streams.push(media);
      return media;
    },
  };
  result.devices = devices;
  const controller = new CameraController(
    devices,
    () => video,
    {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    },
    () => {
      result.interruptions++;
    },
  );
  result.controller = controller;
  t.after(() => controller.dispose());
  return result;
}

test('refresh never activates a camera; connecting restores saved Camo over hardware webcam', async (t) => {
  const f = fixture(t, phone);
  await f.controller.refresh();
  assert.equal(f.requests.length, 0);
  assert.equal(f.controller.state.status, 'off');
  await f.controller.connect();
  assert.equal(f.requests[0].video.deviceId.exact, 'phone');
  assert.equal(f.controller.state.status, 'ready');
  assert.equal(f.controller.state.cameraResolution, '1920 × 1080');
  assert.equal(f.controller.canCapture(), true);
});

test('explicit selection replaces preference only after a working preview', async (t) => {
  const f = fixture(t, webcam);
  await f.controller.connect('phone');
  assert.equal(JSON.parse(f.values.get(CAMERA_KEY)).deviceId, 'phone');
  assert.equal(f.requests[0].audio, false);
  f.controller.off();
  await f.controller.connect();
  assert.equal(f.requests[1].video.deviceId.exact, 'phone');
});

test('a changed driver ID reconnects by its unique saved label', async (t) => {
  const f = fixture(t, { deviceId: 'old-phone', label: 'Camo' });
  await f.controller.connect();
  assert.equal(f.controller.state.deviceId, 'phone');
  assert.equal(f.requests[0].video.deviceId.exact, 'phone');
});

test('missing saved iPhone cannot silently capture the built-in webcam', async (t) => {
  const f = fixture(t, phone);
  f.sources = [webcam];
  await f.controller.connect();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].video.deviceId.exact, 'phone');
  assert.equal(f.controller.state.status, 'error');
  assert.match(f.controller.state.cameraError, /Camo/);
  assert.equal(f.controller.canCapture(), false);
  f.sources.push(phone);
  await f.controller.refresh();
  assert.equal(f.controller.state.status, 'error');
  assert.equal(f.requests.length, 1);
  await f.controller.connect();
  assert.equal(f.controller.state.status, 'ready');
});

test('failed explicit selection stays the retry target without overwriting saved preference', async (t) => {
  const f = fixture(t, webcam);
  await f.controller.refresh();
  f.sources = [webcam];
  await f.controller.connect('phone');
  await f.controller.connect();
  assert.deepEqual(
    f.requests.map((request) => request.video.deviceId.exact),
    ['phone', 'phone'],
  );
  assert.equal(JSON.parse(f.values.get(CAMERA_KEY)).deviceId, 'webcam');
});

test('muting pauses capture and interrupts once; unmuting restores preview without resuming session', async (t) => {
  const f = fixture(t, phone);
  await f.controller.connect();
  f.streams[0].track.mute();
  f.video.dispatchEvent(new Event('waiting'));
  assert.equal(f.controller.state.status, 'paused');
  assert.equal(f.controller.canCapture(), false);
  assert.equal(f.interruptions, 1);
  f.streams[0].track.unmute();
  assert.equal(f.controller.state.status, 'ready');
  assert.equal(f.controller.state.cameraError, '');
  assert.equal(f.interruptions, 1);
});

test('ended stream releases camera, interrupts capture and can reconnect', async (t) => {
  const f = fixture(t, phone);
  await f.controller.connect();
  const old = f.streams[0];
  old.track.end();
  assert.equal(f.controller.state.status, 'disconnected');
  assert.equal(f.video.srcObject, null);
  assert.equal(f.interruptions, 1);
  assert.equal(f.controller.canCapture(), false);
  await f.controller.connect();
  old.track.mute();
  assert.equal(f.controller.state.status, 'ready');
  assert.equal(f.interruptions, 1);
});

test('video waiting blocks capture, playing restores it; orientation updates resolution', async (t) => {
  const f = fixture(t, phone);
  await f.controller.connect();
  f.video.dispatchEvent(new Event('waiting'));
  assert.equal(f.controller.canCapture(), false);
  f.video.readyState = 1;
  f.video.dispatchEvent(new Event('playing'));
  assert.equal(f.controller.state.status, 'paused');
  f.video.readyState = 2;
  f.video.videoWidth = 1080;
  f.video.videoHeight = 1920;
  f.video.dispatchEvent(new Event('resize'));
  f.video.dispatchEvent(new Event('playing'));
  assert.equal(f.controller.state.cameraResolution, '1080 × 1920');
  assert.equal(f.controller.canCapture(), true);
});

test('capture guard rejects unusable preview even before driver events arrive', async (t) => {
  const f = fixture(t, phone);
  await f.controller.connect();
  f.streams[0].track.muted = true;
  assert.equal(f.controller.canCapture(), false);
  f.streams[0].track.muted = false;
  f.video.videoHeight = 0;
  assert.equal(f.controller.canCapture(), false);
  f.video.videoHeight = 1080;
  f.video.paused = true;
  assert.equal(f.controller.canCapture(), false);
});

test('permission denial leaves no ready preview or new preference', async (t) => {
  const f = fixture(t);
  f.devices.getUserMedia = async () => {
    throw new DOMException('Denied', 'NotAllowedError');
  };
  await f.controller.connect('phone');
  assert.equal(f.controller.state.status, 'error');
  assert.match(f.controller.state.cameraError, /Windows Settings/);
  assert.equal(f.values.has(CAMERA_KEY), false);
  assert.equal(f.video.srcObject, null);
});

test('switching cameras cancels old requests and stops late streams', async (t) => {
  const f = fixture(t);
  const pending = deferred();
  f.devices.getUserMedia = (constraints) =>
    constraints.video.deviceId.exact === 'phone'
      ? pending.promise
      : Promise.resolve(makeStream(webcam));
  const first = f.controller.connect('phone');
  await flush();
  await f.controller.connect('webcam');
  const late = makeStream(phone);
  pending.resolve(late);
  await first;
  await flush();
  assert.equal(late.track.stopped, true);
  assert.equal(f.controller.state.deviceId, 'webcam');
  assert.equal(f.controller.state.status, 'ready');
  assert.equal(f.controller.canCapture(), true);
});

test('turn off cancels pending connection without opening camera when it eventually returns', async (t) => {
  const f = fixture(t);
  const pending = deferred();
  f.devices.getUserMedia = () => pending.promise;
  const request = f.controller.connect('phone');
  await flush();
  f.controller.off();
  await request;
  const late = makeStream(phone);
  pending.resolve(late);
  await flush();
  assert.equal(late.track.stopped, true);
  assert.equal(f.controller.state.status, 'off');
  assert.equal(f.video.srcObject, null);
});

for (const stage of ['enumeration', 'camera request', 'video playback']) {
  test(`times out stalled ${stage} and releases late resources`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t, phone);
    const pending = deferred();
    if (stage === 'enumeration')
      f.devices.enumerateDevices = () => pending.promise;
    if (stage === 'camera request')
      f.devices.getUserMedia = () => pending.promise;
    if (stage === 'video playback') f.video.play = () => pending.promise;
    const request = f.controller.connect();
    await flush();
    t.mock.timers.tick(15000);
    await request;
    assert.equal(f.controller.state.status, 'error');
    assert.match(f.controller.state.cameraError, /in time/);
    assert.equal(f.controller.state.scanning, false);
    assert.equal(f.controller.canCapture(), false);
    const late = makeStream(phone);
    pending.resolve(
      stage === 'enumeration'
        ? [phone]
        : stage === 'camera request'
          ? late
          : undefined,
    );
    await flush();
    if (stage === 'camera request') assert.equal(late.track.stopped, true);
    if (stage === 'video playback')
      assert.equal(f.streams[0].track.stopped, true);
    assert.equal(f.controller.state.status, 'error');
    assert.equal(f.video.srcObject, null);
  });
}

test('dispose removes all listeners and stops active stream', async (t) => {
  const f = fixture(t, phone);
  await f.controller.connect();
  const media = f.streams[0];
  f.controller.dispose();
  media.track.end();
  media.track.mute();
  f.video.dispatchEvent(new Event('playing'));
  assert.equal(media.track.stopped, true);
  assert.equal(f.interruptions, 0);
  assert.equal(f.controller.canCapture(), false);
});

test('a camera ending while its first preview is loading fails without waiting for timeout', async (t) => {
  const f = fixture(t, phone);
  const pending = deferred();
  f.video.play = () => pending.promise;
  const request = f.controller.connect();
  await flush();
  assert.equal(f.controller.state.status, 'connecting');
  f.streams[0].track.end();
  await request;
  assert.equal(f.controller.state.status, 'error');
  assert.equal(f.controller.canCapture(), false);
  assert.equal(f.interruptions, 0);
  pending.resolve();
  await flush();
  assert.equal(f.controller.state.status, 'error');
});

test('an old device scan cannot replace a newer device list', async (t) => {
  const f = fixture(t);
  const pending = deferred();
  f.devices.enumerateDevices = () => pending.promise;
  const first = f.controller.refresh();
  f.devices.enumerateDevices = async () => [phone];
  await f.controller.refresh();
  pending.resolve([webcam]);
  await first;
  assert.deepEqual(f.controller.state.devices, [phone]);
  assert.equal(f.controller.state.scanning, false);
});

test('normal startup buffering is allowed before the first playable preview', async (t) => {
  const f = fixture(t, phone);
  f.video.play = async () => {
    f.video.dispatchEvent(new Event('waiting'));
    f.streams[0].track.mute();
    f.streams[0].track.unmute();
    f.video.dispatchEvent(new Event('playing'));
  };
  await f.controller.connect();
  assert.equal(f.controller.state.status, 'ready');
  assert.equal(f.controller.canCapture(), true);
  assert.equal(f.interruptions, 0);
});

test('virtual Camo cameras remain selectable while synthetic cameras are hidden and rejected', async (t) => {
  const f = fixture(t);
  f.sources.push({
    kind: 'videoinput',
    deviceId: 'fake',
    label: 'fake_device_0',
  });
  await f.controller.refresh();
  assert.equal(
    f.controller.state.devices.some((device) => device.label === 'Camo'),
    true,
  );
  assert.equal(
    f.controller.state.devices.some((device) => device.deviceId === 'fake'),
    false,
  );
  await f.controller.connect('fake');
  assert.equal(f.controller.state.status, 'error');
  assert.equal(f.streams[0].track.stopped, true);
  assert.equal(f.controller.canCapture(), false);
});
