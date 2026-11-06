import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { StripRemovalService } from '../src/storage/strip-removal.ts';

function fixture() {
  const f = {
    id: randomUUID(),
    trashed: [],
    queue: [],
    issue: '',
    busy: false,
    pending: false,
    lookups: 0,
  };
  const dependencies = {
    stripFile(id) {
      f.lookups++;
      assert.equal(id, f.id);
      return 'C:/VYORA/strips/VYORA-' + id + '.jpg';
    },
    async paperState() {
      return { queue: f.queue, issue: f.issue };
    },
    busy: () => f.busy,
    pending: () => f.pending,
    async trash(filename) {
      f.trashed.push(filename);
    },
  };
  f.dependencies = dependencies;
  f.service = new StripRemovalService(dependencies);
  return f;
}

test('only a validated saved strip ID can resolve a file for recycling', async () => {
  const f = fixture();
  for (const value of [null, {}, '../../photo', 'file:///other.jpg', ''])
    await assert.rejects(f.service.remove(value), /saved strip/);
  assert.equal(f.lookups, 0);
  assert.deepEqual(f.trashed, []);
  await f.service.remove(f.id);
  assert.deepEqual(f.trashed, ['C:/VYORA/strips/VYORA-' + f.id + '.jpg']);
});

test('queued strips, unreadable paper records, pending sessions and busy printers prevent deletion', async () => {
  for (const state of [
    { queue: [{ stripId: 'target' }], pattern: /print queue/ },
    { issue: 'damaged state', pattern: /Paper records/ },
    { pending: true, pattern: /reviewing/ },
    { busy: true, pattern: /print job/ },
  ]) {
    const f = fixture();
    Object.assign(f, state);
    if (state.queue) f.queue = [{ stripId: f.id }];
    await assert.rejects(f.service.remove(f.id), state.pattern);
    assert.equal(f.trashed.length, 0);
    assert.doesNotThrow(() => f.service.assertAvailable(f.id));
  }
});

test('in-flight deletion blocks duplicate deletes, new queue additions and printer reads', async () => {
  const f = fixture();
  let finish;
  f.dependencies.trash = async (filename) => {
    f.trashed.push(filename);
    await new Promise((resolve) => {
      finish = resolve;
    });
  };
  const request = f.service.remove(f.id);
  await Promise.resolve();
  await Promise.resolve();
  assert.throws(() => f.service.assertAvailable(f.id), /being deleted/);
  await assert.rejects(f.service.remove(f.id), /being deleted/);
  assert.equal(f.trashed.length, 1);
  finish();
  await request;
  assert.doesNotThrow(() => f.service.assertAvailable(f.id));
});

test('queued mutations finishing before the paper snapshot prevent recycling', async () => {
  const f = fixture();
  let resolveState;
  f.dependencies.paperState = () =>
    new Promise((resolve) => {
      resolveState = resolve;
    });
  const request = f.service.remove(f.id);
  assert.throws(() => f.service.assertAvailable(f.id), /being deleted/);
  resolveState({ queue: [{ stripId: f.id }], issue: '' });
  await assert.rejects(request, /print queue/);
  assert.equal(f.trashed.length, 0);
});

test('native recycling failure is actionable, does not expose paths and releases the lock', async () => {
  const f = fixture();
  f.dependencies.trash = async () => {
    throw new Error('C:/private/secret.jpg');
  };
  await assert.rejects(
    f.service.remove(f.id),
    (error) =>
      /Recycle Bin/.test(error.message) && !error.message.includes('private'),
  );
  assert.doesNotThrow(() => f.service.assertAvailable(f.id));
  f.dependencies.trash = async (filename) => {
    f.trashed.push(filename);
  };
  await f.service.remove(f.id);
  assert.equal(f.trashed.length, 1);
});

test('missing saved images cannot recycle other paths', async () => {
  const f = fixture();
  f.dependencies.stripFile = () => {
    throw new Error('File missing');
  };
  await assert.rejects(f.service.remove(f.id), /no longer available/);
  assert.equal(f.trashed.length, 0);
});
