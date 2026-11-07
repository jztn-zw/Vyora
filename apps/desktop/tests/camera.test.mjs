import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCameraSideBands } from '../src/camera-frame.ts';
import {
  cameraErrorMessage,
  isTestCamera,
  openCamera,
  preferredCameraId,
  CAMERA_KEY,
  readCamera,
  saveCamera,
  resolveCameraId,
} from '../src/camera.ts';

test('only matching black side bands are treated as camera padding', () => {
  const width = 160;
  const height = 90;
  function sample(left, right) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = left; x < width - right; x++) {
        data[(y * width + x) * 4] = 100;
      }
    }
    return { data, width, height };
  }
  assert.deepEqual(findCameraSideBands(sample(20, 19)), {
    left: 20,
    right: 19,
  });
  assert.equal(findCameraSideBands(sample(20, 0)), null);
  assert.equal(findCameraSideBands(sample(20, 10)), null);
  assert.equal(findCameraSideBands(sample(0, 0)), null);
  assert.equal(findCameraSideBands(sample(80, 80)), null);
});

function webcam(label = 'Integrated Camera') {
  const track = {
    label,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  return { track, getVideoTracks: () => [track], getTracks: () => [track] };
}

test('opens a real webcam without requesting audio', async () => {
  const media = webcam();
  const result = await openCamera({
    async getUserMedia(constraints) {
      assert.equal(constraints.audio, false);
      return media;
    },
  });
  assert.equal(result, media);
  assert.equal(media.track.stopped, false);
});

for (const failure of ['OverconstrainedError', 'NotFoundError']) {
  test(`never switches to a different camera after ${failure}`, async () => {
    const requests = [];
    const media = webcam();
    await assert.rejects(
      openCamera(
        {
          async getUserMedia(constraints) {
            requests.push(constraints);
            if (requests.length === 1)
              throw new DOMException('Webcam removed', failure);
            return media;
          },
        },
        'removed-webcam',
      ),
      { name: failure },
    );
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].video.deviceId, { exact: 'removed-webcam' });
  });
}

test('does not retry a denied camera permission', async () => {
  let requests = 0;
  await assert.rejects(
    openCamera(
      {
        async getUserMedia() {
          requests++;
          throw new DOMException('Denied', 'NotAllowedError');
        },
      },
      'camera-1',
    ),
    { name: 'NotAllowedError' },
  );
  assert.equal(requests, 1);
});

test('camera preferences tolerate invalid or unavailable storage', () => {
  for (const value of [
    'not json',
    'null',
    '{}',
    '{"deviceId":1,"label":"Camo"}',
    '{"deviceId":"cam","label":"fake_device_0"}',
  ]) {
    assert.equal(readCamera({ getItem: () => value }), null);
  }
  const blocked = {
    getItem() {
      throw new Error('Blocked');
    },
    setItem() {
      throw new Error('Blocked');
    },
  };
  assert.equal(readCamera(blocked), null);
  assert.doesNotThrow(() =>
    saveCamera(blocked, { deviceId: 'cam', label: 'Camo' }),
  );
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  saveCamera(storage, { deviceId: 'cam', label: 'Camo' });
  assert.deepEqual(readCamera(storage), { deviceId: 'cam', label: 'Camo' });
  assert.ok(values.has(CAMERA_KEY));
});

test('restores exact camera or unique label after driver ID changes', () => {
  const devices = [
    { deviceId: 'webcam', label: 'HD Webcam' },
    { deviceId: 'new', label: 'Camo' },
  ];
  assert.equal(
    resolveCameraId(devices, { deviceId: 'new', label: 'Camo' }),
    'new',
  );
  assert.equal(
    resolveCameraId(devices, { deviceId: 'old', label: ' camo ' }),
    'new',
  );
  assert.equal(resolveCameraId(devices, null), 'webcam');
  assert.equal(
    resolveCameraId(devices, { deviceId: 'missing', label: 'iPhone' }),
    'missing',
  );
  assert.equal(
    resolveCameraId([...devices, { deviceId: 'duplicate', label: 'Camo' }], {
      deviceId: 'old',
      label: 'Camo',
    }),
    'old',
  );
  assert.equal(
    resolveCameraId([{ deviceId: 'hidden', label: '' }], {
      deviceId: 'old',
      label: '',
    }),
    'old',
  );
});

test('cancelling a pending camera request stops its late stream', async () => {
  let deliver;
  const pending = new Promise((resolve) => {
    deliver = resolve;
  });
  const abort = new AbortController();
  const camera = webcam();
  const request = openCamera(
    { getUserMedia: () => pending },
    'cam',
    abort.signal,
  );
  abort.abort();
  await assert.rejects(request, { name: 'AbortError' });
  deliver(camera);
  await Promise.resolve();
  assert.equal(camera.track.stopped, true);
});

test('stops a synthetic stream rather than showing it as a webcam', async () => {
  const media = webcam('fake_device_0');
  await assert.rejects(
    openCamera({
      async getUserMedia() {
        return media;
      },
    }),
    /Test camera detected/,
  );
  assert.equal(media.track.stopped, true);
});

test('keeps real and virtual cameras available while identifying Chromium test devices', () => {
  assert.equal(isTestCamera('fake_device_0'), true);
  assert.equal(isTestCamera('fake_device_12'), true);
  for (const name of [
    'Integrated Camera',
    'OBS Virtual Camera',
    'USB Camera',
    '',
  ]) {
    assert.equal(isTestCamera(name), false);
  }
});

test('prefers a hardware webcam over a disconnected phone or virtual camera', () => {
  const devices = [
    { deviceId: 'phone', label: 'POCO F5 (Windows Virtual Camera)' },
    { deviceId: 'webcam', label: 'HD Webcam (5986:211b)' },
    { deviceId: 'virtual', label: 'OBS Virtual Camera' },
  ];
  assert.equal(preferredCameraId(devices), 'webcam');
  assert.equal(preferredCameraId([devices[2]]), 'virtual');
  assert.equal(preferredCameraId([]), '');
});

test('gives distinct recovery guidance for missing, busy and blocked webcams', () => {
  assert.match(
    cameraErrorMessage(new DOMException('', 'NotFoundError')),
    /Connect a camera/,
  );
  assert.match(
    cameraErrorMessage(new DOMException('', 'NotReadableError')),
    /Close other apps/,
  );
  assert.match(
    cameraErrorMessage(new DOMException('', 'NotAllowedError')),
    /Windows Settings/,
  );
  assert.match(
    cameraErrorMessage(new Error('Test camera detected')),
    /reopen VYORA/,
  );
});
