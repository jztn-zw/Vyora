import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GuestHub, parseGuestCommand } from '../src/guest-hub.ts';
import path from 'node:path';

const state = (change = {}) => ({
  revision: 0,
  theme: 'dark',
  mode: 'self-service',
  stage: 'ready',
  ready: true,
  busy: false,
  paused: false,
  mirror: true,
  countdown: null,
  current: 1,
  total: 4,
  message: 'Ready',
  error: '',
  frames: [
    {
      id: '',
      name: 'Doodle',
      shots: 4,
      preview: 'data:image/png;base64,aGVsbG8=',
    },
  ],
  photos: [{ id: 'photo-1', thumbnail: 'data:image/png;base64,aGVsbG8=' }],
  strip: '',
  ...change,
});
test('guest commands reject invalid payloads and arbitrary actions', () => {
  for (const value of [
    null,
    {},
    { action: 'delete', revision: 1 },
    { action: 'retake', revision: 1, photoIds: ['a', 'a'] },
    { action: 'frame', revision: -1, frameId: '' },
    { action: 'effect', revision: 1, effect: 'unknown' },
    { action: 'effect', revision: 1 },
  ])
    assert.throws(() => parseGuestCommand(value));
});

test('guests cannot advance a pending or failed print or request a retry', async () => {
  const commands = [];
  const hub = new GuestHub('.', async (value) => commands.push(value));
  for (const status of ['preparing', 'submitting', 'failed', 'uncertain']) {
    hub.publish(state({ stage: 'printing', printJob: { status } }));
    await assert.rejects(
      hub.dispatch({ action: 'next', revision: hub.snapshot.revision }),
    );
  }
  hub.publish(state({ stage: 'printing', printJob: { status: 'submitted' } }));
  await hub.dispatch({ action: 'next', revision: hub.snapshot.revision });
  assert.equal(commands.length, 1);
  assert.throws(() =>
    parseGuestCommand({ action: 'retry-print', revision: 1 }),
  );
  hub.dispose();
});
test('guest retakes accept fifteen photos and reject requests above the capture limit', () => {
  const photoIds = Array.from({ length: 15 }, (_, index) => `photo-${index}`);
  assert.deepEqual(
    parseGuestCommand({ action: 'retake', revision: 1, photoIds }).photoIds,
    photoIds,
  );
  assert.throws(() =>
    parseGuestCommand({
      action: 'retake',
      revision: 1,
      photoIds: [...photoIds, 'extra'],
    }),
  );
});

test('guest framing accepts only captured areas in an authorized review session', async () => {
  const commands = [];
  const hub = new GuestHub('.', async (command) => commands.push(command));
  const change = {
    stage: 'review',
    areas: [{ photoIndex: 0, width: 300, height: 400 }],
  };
  const crop = { x: 0, y: 0.5, zoom: 1.4 };
  hub.publish(state(change));
  await hub.dispatch({
    action: 'crop',
    revision: hub.snapshot.revision,
    areaIndex: 0,
    crop,
  });
  assert.deepEqual(commands[0].crop, crop);
  for (const extra of [
    { stage: 'ready' },
    { mode: 'assisted' },
    { paused: true },
    { busy: true },
    { photos: [] },
  ]) {
    hub.publish(state({ ...change, ...extra }));
    await assert.rejects(
      hub.dispatch({
        action: 'crop',
        revision: hub.snapshot.revision,
        areaIndex: 0,
        crop,
      }),
    );
  }
  for (const areaIndex of [-1, 15, 1.5])
    assert.throws(() =>
      parseGuestCommand({ action: 'crop', revision: 1, areaIndex, crop }),
    );
  assert.throws(() =>
    parseGuestCommand({
      action: 'crop',
      revision: 1,
      areaIndex: 0,
      crop: { ...crop, zoom: 5 },
    }),
  );
  hub.dispose();
});
test('effects can change during review and accept only supported presets', async () => {
  const commands = [];
  const hub = new GuestHub('.', async (command) => commands.push(command));
  let previousEffect = 'warm';
  for (const effect of ['original', 'mono', 'warm']) {
    hub.publish(state({ stage: 'review', effect: previousEffect }));
    await hub.dispatch({
      action: 'effect',
      revision: hub.snapshot.revision,
      effect,
    });
    assert.equal(commands.at(-1).effect, effect);
    previousEffect = effect;
  }
  for (const stage of ['ready', 'capture', 'done']) {
    hub.publish(state({ stage }));
    await assert.rejects(
      hub.dispatch({
        action: 'effect',
        revision: hub.snapshot.revision,
        effect: 'mono',
      }),
    );
  }
  hub.dispose();
});
test('session authority rejects stale actions, duplicate requests, paused sessions and assisted input', async () => {
  let captures = 0;
  const hub = new GuestHub('.', async () => {
    captures++;
  });
  hub.publish(state());
  const revision = hub.snapshot.revision;
  await assert.rejects(
    hub.dispatch({ action: 'start', revision: revision - 1 }),
  );
  await hub.dispatch({ action: 'start', revision });
  await assert.rejects(hub.dispatch({ action: 'start', revision }));
  hub.publish(state({ paused: true }));
  await assert.rejects(
    hub.dispatch({ action: 'start', revision: hub.snapshot.revision }),
  );
  hub.publish(state({ mode: 'assisted' }));
  await assert.rejects(
    hub.dispatch({ action: 'start', revision: hub.snapshot.revision }),
  );
  assert.equal(captures, 1);
  hub.dispose();
});
test('simultaneous displays cannot start two captures; heartbeats preserve action revision', async () => {
  let release;
  const hub = new GuestHub(
    '.',
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  hub.publish(state());
  const revision = hub.snapshot.revision;
  const first = hub.dispatch({ action: 'start', revision });
  hub.publish(state());
  assert.equal(hub.snapshot.revision, revision);
  await assert.rejects(hub.dispatch({ action: 'start', revision }));
  release();
  await first;
  hub.dispose();
});
test('retakes are limited to current photos and failed saves can be retried', async () => {
  let attempts = 0;
  const hub = new GuestHub('.', async () => {
    if (++attempts === 1) throw new Error('Disk full');
  });
  const photos = Array.from({ length: 4 }, (_, index) => ({
    ...state().photos[0],
    id: `photo-${index + 1}`,
  }));
  hub.publish(state({ stage: 'review', photos }));
  const revision = hub.snapshot.revision;
  await assert.rejects(
    hub.dispatch({ action: 'retake', revision, photoIds: ['not-current'] }),
  );
  await assert.rejects(
    hub.dispatch({ action: 'confirm', revision }),
    /Disk full/,
  );
  await hub.dispatch({ action: 'confirm', revision });
  assert.equal(attempts, 2);
  hub.dispose();
});
test('incomplete guest sessions can finish the missing photos but cannot save', async () => {
  const commands = [];
  const hub = new GuestHub('.', async (command) =>
    commands.push(command.action),
  );
  hub.publish(state({ stage: 'review', ready: false }));
  await assert.rejects(
    hub.dispatch({ action: 'continue', revision: hub.snapshot.revision }),
  );
  hub.publish(state({ stage: 'review' }));
  const revision = hub.snapshot.revision;
  await assert.rejects(hub.dispatch({ action: 'confirm', revision }));
  await hub.dispatch({ action: 'continue', revision });
  assert.deepEqual(commands, ['continue']);
  hub.dispose();
});
test('tablet needs organizer approval; origin checks, image authorization and revocation protect session', async () => {
  const hub = new GuestHub(path.resolve('apps/desktop'), async () => {});
  try {
    await hub.start();
    hub.publish(state());
    // Local endpoint is only used by this isolated test, never a user's library.
    const address = hub.status().urls[0];
    assert.ok(address, 'A local network interface is available');
    const remote = new URL(address);
    const base = `http://127.0.0.1:${remote.port}`;
    const post = (route, input, cookie = '', origin = base) =>
      fetch(base + route, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal(
      (
        await post(
          '/api/pair',
          { code: hub.status().pairingCode },
          '',
          'http://untrusted.example',
        )
      ).status,
      403,
    );
    const paired = await post('/api/pair', {
      code: hub.status().pairingCode,
      name: 'Test tablet',
    });
    assert.equal(paired.status, 200);
    const cookie = paired.headers.get('set-cookie').split(';')[0];
    assert.equal(
      (await fetch(base + '/api/state', { headers: { Cookie: cookie } }))
        .status,
      403,
    );
    const device = hub.status().devices[0];
    hub.approve(device.id);
    const snapshot = await (
      await fetch(base + '/api/state', { headers: { Cookie: cookie } })
    ).json();
    assert.match(snapshot.frames[0].preview, /^\/api\/image\//);
    assert.equal((await fetch(base + snapshot.frames[0].preview)).status, 401);
    assert.equal(
      (
        await fetch(base + snapshot.frames[0].preview, {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + `/api/state?since=${snapshot.revision}`, {
          headers: { Cookie: cookie },
        })
      ).status,
      304,
    );
    assert.equal(
      (
        await post(
          '/api/command',
          { action: 'start', revision: snapshot.revision },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          '/api/command',
          { action: 'start', revision: snapshot.revision },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await fetch(base + '/api/library', { headers: { Cookie: cookie } }))
        .status,
      404,
    );
    assert.equal((await fetch(base + '/src/main.ts')).status, 404);
    hub.revoke(device.id);
    assert.equal(
      (await fetch(base + '/api/state', { headers: { Cookie: cookie } }))
        .status,
      401,
    );
    hub.stop();
    assert.equal(hub.status().devices.length, 0);
  } finally {
    hub.dispose();
  }
});

test('controller heartbeat expiry blocks actions and resumes the same session after recovery', async () => {
  const hub = new GuestHub('.', async () => {});
  const clock = Date.now;
  try {
    const now = clock();
    Date.now = () => now;
    hub.publish(state());
    const revision = hub.snapshot.revision;
    Date.now = () => now + 7000;
    assert.equal(hub.state(), null);
    await assert.rejects(
      hub.dispatch({ action: 'start', revision }),
      /organizer/,
    );
    hub.publish(state());
    assert.equal(hub.state().revision, revision);
    await hub.dispatch({ action: 'start', revision });
  } finally {
    Date.now = clock;
    hub.dispose();
  }
});
