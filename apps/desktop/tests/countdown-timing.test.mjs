import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countdownReading,
  localCountdownDeadline,
} from '../src/countdown-timing.ts';
import { GuestHub } from '../src/guest-hub.ts';

test('operator and guest digits match despite different clocks and network delay', () => {
  for (const clockOffset of [-180000, 0, 240000]) {
    const hostStart = 500000;
    const clientStart = hostStart + clockOffset;
    const localEnd = localCountdownDeadline(
      hostStart + 3000,
      hostStart + 80,
      clientStart,
      clientStart + 160,
    );
    for (const elapsed of [
      160, 999, 1000, 1001, 1490, 1999, 2000, 2999, 3000, 3300,
    ]) {
      assert.equal(
        countdownReading(localEnd, clientStart + elapsed, 3).seconds,
        countdownReading(hostStart + 3000, hostStart + elapsed, 3).seconds,
      );
    }
  }
});

test('a late snapshot catches up immediately and never replays missed digits', () => {
  const end = 8000;
  assert.equal(countdownReading(end, 5100, 5).seconds, 3);
  assert.equal(countdownReading(end, 7200, 5).seconds, 1);
  assert.equal(countdownReading(end, 8000, 5).seconds, null);
  assert.equal(countdownReading(end, 12000, 5).seconds, null);
});

test('every supported duration changes at the same exact second boundaries', () => {
  for (const duration of [3, 5, 10]) {
    const start = 40000,
      end = start + duration * 1000;
    for (let seconds = duration; seconds > 0; seconds--) {
      const now = end - seconds * 1000;
      assert.equal(countdownReading(end, now, duration).seconds, seconds);
      assert.equal(countdownReading(end, now + 999, duration).seconds, seconds);
      assert.equal(
        countdownReading(end, now + 1000, duration).seconds,
        seconds === 1 ? null : seconds - 1,
      );
    }
  }
});

test('ring phase and next update follow elapsed time, including after throttling', () => {
  assert.deepEqual(countdownReading(5000, 2350, 5), {
    seconds: 3,
    elapsed: 350,
    nextTick: 651,
  });
  assert.deepEqual(countdownReading(5000, 4999, 5), {
    seconds: 1,
    elapsed: 999,
    nextTick: 2,
  });
});

test('clock-estimation jitter cannot add an extra digit at the start', () => {
  assert.equal(countdownReading(5000.5, 0, 5).seconds, 5);
  assert.equal(countdownReading(10000.5, 0, 10).seconds, 10);
  assert.equal(countdownReading(5000.5, 0, 5).elapsed, 0);
});

test('clearing or restarting a countdown cannot preserve the previous deadline', () => {
  assert.equal(localCountdownDeadline(null, 10000, 0, 10), null);
  assert.equal(localCountdownDeadline(undefined, 10000, 0, 10), null);
  assert.equal(localCountdownDeadline(NaN, 10000, 0, 10), null);
  assert.equal(countdownReading(null, 0, null).seconds, null);
  assert.equal(countdownReading(13000, 10000, 3).seconds, 3);
  assert.equal(countdownReading(13000, 13000, 3).seconds, null);
  assert.equal(countdownReading(17000, 14000, 3).seconds, 3);
});

test('older snapshots without timing metadata still render their supplied digit', () => {
  assert.equal(countdownReading(undefined, 100, 2).seconds, 2);
  for (const invalid of [0, -1, 11, NaN, 2.5, null])
    assert.equal(countdownReading(undefined, 100, invalid).seconds, null);
  assert.equal(localCountdownDeadline(3000, undefined, 100, 200), 3000);
});

test('reading the host clock does not change the action revision or countdown deadline', () => {
  const hub = new GuestHub('.', async () => {});
  try {
    const published = {
      revision: 0,
      theme: 'dark',
      mode: 'assisted',
      stage: 'capture',
      ready: true,
      busy: false,
      paused: false,
      mirror: false,
      countdown: 3,
      countdownEndsAt: Date.now() + 3000,
      current: 1,
      total: 4,
      message: 'Ready',
      error: '',
      frames: [],
      photos: [],
      strip: '',
    };
    hub.publish(published);
    const revision = hub.snapshot.revision;
    const first = hub.state(),
      second = hub.state();
    assert.equal(first.countdownEndsAt, published.countdownEndsAt);
    assert.equal(second.countdownEndsAt, first.countdownEndsAt);
    assert.equal(first.revision, revision);
    assert.equal(second.revision, revision);
    assert.ok(Number.isFinite(first.hostTime));
    assert.equal(hub.snapshot.hostTime, undefined);
    hub.publish(published);
    assert.equal(hub.snapshot.revision, revision);
  } finally {
    hub.dispose();
  }
});
