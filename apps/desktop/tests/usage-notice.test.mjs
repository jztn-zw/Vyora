import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptNotice,
  hasAcceptedNotice,
  NOTICE_REVISION,
  NOTICE_STORAGE_KEY,
} from '../src/usage-notice.ts';

test('acceptance requires the current notice revision and a valid local record', () => {
  let stored = null;
  const storage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  };
  for (const invalid of [
    null,
    'bad json',
    'true',
    '{}',
    JSON.stringify({
      revision: 'older-notice',
      appVersion: '0.1.0',
      acceptedAt: new Date().toISOString(),
    }),
    JSON.stringify({
      revision: NOTICE_REVISION,
      appVersion: '0.1.0',
      acceptedAt: 'invalid',
    }),
  ]) {
    stored = invalid;
    assert.equal(hasAcceptedNotice(storage), false);
  }
  acceptNotice(storage, '0.1.0');
  assert.equal(hasAcceptedNotice(storage), true);
  const record = JSON.parse(stored);
  assert.deepEqual(Object.keys(record).sort(), [
    'acceptedAt',
    'appVersion',
    'revision',
  ]);
  assert.equal(record.revision, NOTICE_REVISION);
  assert.equal(record.appVersion, '0.1.0');
  assert.ok(Date.now() - Date.parse(record.acceptedAt) < 1000);
});

test('unavailable storage does not count as acceptance or pretend it saved', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(hasAcceptedNotice(blocked), false);
  assert.throws(() => acceptNotice(blocked, '0.1.0'), /blocked/);
  assert.equal(NOTICE_STORAGE_KEY, 'vyora.notice-acceptance');
});
