import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { nativeImage } from 'electron';
import { createLibrary } from './library';
import { createSessionBuffer } from './session-buffer';
import { evenlySpacedSlots } from '../template-layout';

export function runStorageSmoke() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'vyora-storage-test-'));
  let library: ReturnType<typeof createLibrary> | undefined;
  try {
    library = createLibrary(directory);
    const image = nativeImage.createFromBitmap(
      Buffer.from([40, 80, 112, 255]),
      { width: 1, height: 1 },
    );
    const jpeg = image.toJPEG(90);
    assert.ok(jpeg.length > 4);
    const captures = createSessionBuffer();
    const id = randomUUID();
    for (let index = 0; index < 4; index++)
      captures.stage(id, jpeg, image.getSize(), image.toDataURL());
    assert.equal(
      library.read().photoCount,
      0,
      'Individual captures must never become database photos',
    );
    assert.equal(
      library.read().stripCount,
      0,
      'An unfinished strip is not saved',
    );
    assert.equal(
      existsSync(path.join(directory, 'photos')),
      false,
      'Capturing must not create an individual-photo folder',
    );
    assert.equal(readdirSync(library.stripDirectory).length, 0);
    assert.throws(
      () => captures.stage(id, jpeg, image.getSize(), image.toDataURL()),
      'A fifth capture is rejected',
    );
    assert.throws(
      () =>
        captures.stage(randomUUID(), jpeg, image.getSize(), image.toDataURL()),
      'An unsaved strip cannot be replaced',
    );
    const original = captures.read(id);
    const replacementImage = nativeImage.createFromBitmap(
      Buffer.from([180, 50, 90, 255]),
      { width: 1, height: 1 },
    );
    const replacement = replacementImage.toJPEG(90);
    for (const index of [0, 2])
      captures.replace(
        id,
        original.photos[index].id,
        replacement,
        replacementImage.getSize(),
        replacementImage.toDataURL(),
      );
    const strip = captures.read(id);
    assert.equal(
      strip.createdAt,
      original.createdAt,
      'Retaking the first photo keeps the session timestamp',
    );
    assert.deepEqual(
      strip.photos.map((photo) => photo.id),
      original.photos.map((photo) => photo.id),
    );
    for (const index of [1, 3])
      assert.deepEqual(strip.photos[index], original.photos[index]);
    assert.equal(
      readdirSync(library.stripDirectory).length,
      0,
      'Review and retakes do not save a strip before confirmation',
    );
    assert.equal(existsSync(path.join(directory, 'photos')), false);
    assert.equal(strip.photos.length, 4);
    assert.equal(
      strip.photos[0].thumbnail,
      `data:image/jpeg;base64,${replacement.toString('base64')}`,
    );

    // A failed save leaves the RAM captures available for a retry.
    assert.throws(() =>
      library!.saveStrip(strip, Buffer.from('invalid JPEG'), ''),
    );
    assert.equal(captures.has(id), true);
    assert.equal(library.read().stripCount, 0);
    const exported = library.saveStrip(strip, jpeg, image.toDataURL());
    captures.clear(id);
    assert.equal(captures.has(id), false);
    assert.throws(() => captures.read(id));
    assert.deepEqual(readFileSync(exported), jpeg);
    assert.equal(
      readdirSync(library.stripDirectory).length,
      1,
      'Only the combined strip file is written',
    );
    assert.equal(existsSync(path.join(directory, 'photos')), false);
    assert.equal(library.read().photoCount, 0);

    // Custom frames persist locally and bind the session to one immutable layout.
    const frameImage = image.resize({ width: 200, height: 600 });
    const framePng = frameImage.toPNG();
    const frameDraft = {
      name: 'Test imported frame',
      width: 200,
      height: 600,
      frame: `data:image/png;base64,${framePng.toString('base64')}`,
      layer: 'background' as const,
      slots: evenlySpacedSlots(2).map((slot, index) => ({
        ...slot,
        rotation: index === 0 ? 15 : -10,
      })),
    };
    const template = library.templates.save(
      frameDraft,
      framePng,
      frameImage.toDataURL(),
    );
    assert.equal(library.templates.list()[0].name, frameDraft.name);
    assert.equal(library.templates.get(template.id).frame, frameDraft.frame);
    assert.deepEqual(
      library.templates.get(template.id).slots.map((slot) => slot.rotation),
      [15, -10],
    );
    assert.throws(() => library!.templates.get('../outside'));
    const customSession = randomUUID();
    captures.stage(
      customSession,
      jpeg,
      image.getSize(),
      image.toDataURL(),
      template,
    );
    assert.throws(
      () =>
        captures.stage(customSession, jpeg, image.getSize(), image.toDataURL()),
      'A capture cannot change the template mid-session',
    );
    captures.stage(
      customSession,
      jpeg,
      image.getSize(),
      image.toDataURL(),
      template,
    );
    assert.throws(
      () =>
        captures.stage(
          customSession,
          jpeg,
          image.getSize(),
          image.toDataURL(),
          template,
        ),
      'The template slot count bounds the capture sequence',
    );
    assert.equal(captures.read(customSession).template!.id, template.id);
    assert.equal(captures.pending()!.template!.width, 200);
    assert.deepEqual(
      captures.read(customSession).template!.slots.map((slot) => slot.rotation),
      [15, -10],
    );
    captures.clear(customSession);
    const managed = library.templates.save(
      { ...frameDraft, name: 'Managed frame' },
      framePng,
      frameImage.toDataURL(),
    );
    const updated = library.templates.update(managed.id, {
      ...managed,
      name: 'Edited frame',
      slots: managed.slots.map((slot) => ({ ...slot, rotation: 12 })),
    });
    assert.equal(updated.id, managed.id);
    assert.equal(library.templates.get(managed.id).name, 'Edited frame');
    assert.equal(library.templates.get(managed.id).slots[0].rotation, 12);
    assert.throws(
      () => library!.templates.update(managed.id, { ...managed, width: 201 }),
      /artwork/,
    );
    library.templates.remove(managed.id);
    assert.ok(!library.templates.list().some((item) => item.id === managed.id));
    assert.throws(() => library!.templates.get(managed.id));
    assert.throws(() => library!.templates.remove('../outside'));
    assert.equal(library.templates.get(template.id).id, template.id);
    assert.equal(
      library.read().stripCount,
      1,
      'Managing templates preserves finished strips',
    );
    library.close();
    library = undefined;
    library = createLibrary(directory);
    assert.equal(
      library.templates.get(template.id).slots.length,
      2,
      'Templates survive reopening',
    );
    assert.deepEqual(
      library.templates.get(template.id).slots.map((slot) => slot.rotation),
      [15, -10],
    );
    assert.equal(
      library.read().stripCount,
      1,
      'Importing a template does not create a photo strip',
    );
    assert.equal(library.read().strips[0].preview, image.toDataURL());
    assert.ok(
      library.readStrip(id).photos.every((photo) => photo.thumbnail === ''),
      'Saved metadata must not retain individual shot images',
    );
    assert.equal(
      library.saveStrip(strip, jpeg, image.toDataURL()),
      exported,
      'Retry does not create another strip',
    );
    assert.equal(library.stripFile(id), exported);
    assert.throws(() => library!.stripFile('../photos'));
    library.close();
    library = undefined;
    library = createLibrary(directory);
    assert.equal(library.read().stripCount, 1);
    assert.equal(library.readStrip(id).photos.length, 4);
    assert.equal(
      library.stripFile(id),
      exported,
      'Finished strips survive restart without originals',
    );

    // Cancelled/disconnected sessions can save a partial strip without individual JPEGs.
    const partialId = randomUUID();
    captures.stage(partialId, jpeg, image.getSize(), image.toDataURL());
    library.saveStrip(captures.read(partialId), jpeg, image.toDataURL());
    captures.clear(partialId);
    assert.equal(library.readStrip(partialId).photos.length, 1);
    assert.equal(library.read().photoCount, 0);

    // External deletions hide cards, but metadata and restored files remain usable.
    const missingDirectory = path.join(directory, 'missing-files');
    const missing = createLibrary(missingDirectory);
    const fixtures: { id: string; file: string }[] = [];
    try {
      for (let index = 0; index < 15; index++) {
        const fixture = {
          ...strip,
          id: randomUUID(),
          createdAt: new Date(1700000000000 + index * 1000).toISOString(),
        };
        fixtures.push({
          id: fixture.id,
          file: missing.saveStrip(fixture, jpeg, image.toDataURL()),
        });
      }
      for (const fixture of fixtures.slice(-3)) unlinkSync(fixture.file);
      const visible = missing.read();
      assert.equal(visible.stripCount, 12);
      assert.equal(
        visible.strips.length,
        12,
        'Filtering must happen before the latest-12 limit',
      );
      assert.deepEqual(
        new Set(visible.strips.map((item) => item.id)),
        new Set(fixtures.slice(0, 12).map((item) => item.id)),
      );
      assert.ok(
        missing.readStrip(fixtures[14].id).preview,
        'Missing-file metadata is retained',
      );
      writeFileSync(fixtures[14].file, jpeg);
      assert.equal(missing.read().stripCount, 13);
      assert.ok(
        missing.read().strips.some((item) => item.id === fixtures[14].id),
        'Restoring a file restores its gallery entry',
      );
      const movedFolder = path.join(missingDirectory, 'strips-moved');
      assert.equal(path.dirname(missing.stripDirectory), missingDirectory);
      assert.equal(path.dirname(movedFolder), missingDirectory);
      renameSync(missing.stripDirectory, movedFolder);
      try {
        assert.equal(
          missing.read().stripCount,
          0,
          'A missing strip folder is treated as empty',
        );
      } finally {
        renameSync(movedFolder, missing.stripDirectory);
      }
      assert.equal(missing.read().stripCount, 13);
    } finally {
      missing.close();
    }
    const reopenedMissing = createLibrary(missingDirectory);
    try {
      assert.equal(
        reopenedMissing.read().stripCount,
        13,
        'Availability filtering also works after restart',
      );
    } finally {
      reopenedMissing.close();
    }

    // Simulate disk/path failure. No successful row or partial output may remain.
    const blockedDirectory = path.join(directory, 'blocked');
    const blocked = createLibrary(blockedDirectory);
    try {
      rmSync(blocked.stripDirectory, { recursive: true });
      writeFileSync(blocked.stripDirectory, 'not a directory');
      assert.throws(() => blocked.saveStrip(strip, jpeg, image.toDataURL()));
      assert.equal(blocked.read().stripCount, 0);
      unlinkSync(blocked.stripDirectory);
      mkdirSync(blocked.stripDirectory);
      blocked.saveStrip(strip, jpeg, image.toDataURL());
      assert.equal(
        blocked.read().stripCount,
        1,
        'Saving succeeds after storage becomes writable again',
      );
    } finally {
      blocked.close();
    }

    // Existing individual files are preserved and their old sessions still export.
    const legacyDirectory = path.join(directory, 'legacy');
    mkdirSync(path.join(legacyDirectory, 'photos'), { recursive: true });
    const legacy = new DatabaseSync(
      path.join(legacyDirectory, 'library.sqlite'),
    );
    legacy.exec(
      `CREATE TABLE photos (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, filename TEXT NOT NULL UNIQUE, thumbnail TEXT NOT NULL); PRAGMA user_version = 1;`,
    );
    const oldInsert = legacy.prepare(
      'INSERT INTO photos VALUES (?, ?, 1, 1, ?, ?)',
    );
    const ids = Array.from({ length: 6 }, () => randomUUID());
    ids.forEach((photoId, index) => {
      oldInsert.run(
        photoId,
        new Date(1700000000000 + index * 6000).toISOString(),
        `${photoId}.jpg`,
        image.toDataURL(),
      );
      writeFileSync(
        path.join(legacyDirectory, 'photos', `${photoId}.jpg`),
        jpeg,
      );
    });
    legacy.close();
    const migrated = createLibrary(legacyDirectory);
    try {
      assert.equal(migrated.read().photoCount, 6);
      assert.equal(migrated.read().stripCount, 2);
      const oldStrip = migrated.readStrip(migrated.read().strips[1].id, true);
      assert.deepEqual(
        oldStrip.photos.map((photo) => photo.id),
        ids.slice(0, 4),
      );
      const legacyExport = migrated.saveStrip(
        oldStrip,
        jpeg,
        image.toDataURL(),
      );
      assert.equal(
        migrated.read().stripCount,
        2,
        'Exporting a legacy strip does not duplicate its gallery entry',
      );
      assert.deepEqual(
        readFileSync(path.join(legacyDirectory, 'photos', `${ids[0]}.jpg`)),
        jpeg,
      );
      assert.equal(readdirSync(path.join(legacyDirectory, 'photos')).length, 6);
      const unexportedPhoto = path.join(
        legacyDirectory,
        'photos',
        `${ids[4]}.jpg`,
      );
      unlinkSync(unexportedPhoto);
      assert.equal(
        migrated.read().stripCount,
        1,
        'A legacy session needs all its source files',
      );
      writeFileSync(unexportedPhoto, jpeg);
      assert.equal(migrated.read().stripCount, 2);
      unlinkSync(legacyExport);
      assert.equal(
        migrated.read().stripCount,
        1,
        'Deleting a saved legacy strip must not resurrect its source-photo card',
      );
      writeFileSync(legacyExport, jpeg);
      assert.equal(migrated.read().stripCount, 2);
    } finally {
      migrated.close();
    }
    console.log(
      'PASS: strip-only saving, retakes, retries, legacy preservation, templates, and missing-file filtering/restoration',
    );
  } finally {
    library?.close();
    if (
      path.dirname(directory) === os.tmpdir() &&
      path.basename(directory).startsWith('vyora-storage-test-')
    ) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
