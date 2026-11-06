import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { LibraryInfo, StripRecord } from '@vyora/shared';
import { createTemplateStore } from './templates';
import type { IncludedTemplates } from './included-templates';

const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createLibrary(directory: string, included?: IncludedTemplates) {
  const photoDirectory = path.join(directory, 'photos');
  const stripDirectory = path.join(directory, 'strips');
  mkdirSync(stripDirectory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'library.sqlite'));
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  );
  const version = Number(
    db.prepare('PRAGMA user_version').get()?.user_version ?? 0,
  );
  if (version > 4) {
    db.close();
    throw new Error(
      'This photo library was created by a newer version of VYORA.',
    );
  }
  // Retain the old table and its files for backward-compatible library access.
  // New sessions never insert individual photographs or create a photos folder.
  db.exec(`CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
    width INTEGER NOT NULL CHECK(width > 0), height INTEGER NOT NULL CHECK(height > 0),
    filename TEXT NOT NULL UNIQUE, thumbnail TEXT NOT NULL
  );`);
  if (version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE photos ADD COLUMN session_id TEXT;');
      let sessionId = randomUUID();
      let count = 0;
      let previous = 0;
      const assign = db.prepare(
        'UPDATE photos SET session_id = ? WHERE id = ?',
      );
      for (const row of db
        .prepare('SELECT id, created_at FROM photos ORDER BY created_at, rowid')
        .all()) {
        const captured = Date.parse(String(row.created_at));
        if (count === 4 || captured - previous > 45000) {
          sessionId = randomUUID();
          count = 0;
        }
        assign.run(sessionId, String(row.id));
        previous = captured;
        count++;
      }
      db.exec(
        'CREATE INDEX photos_session ON photos(session_id); PRAGMA user_version = 2; COMMIT;',
      );
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }
  if (version < 3) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS strips (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        photos_json TEXT NOT NULL, thumbnail TEXT NOT NULL, filename TEXT NOT NULL UNIQUE
      );
      PRAGMA user_version = 3; COMMIT;`);
  }
  if (version < 4) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        slots_json TEXT NOT NULL, layer TEXT NOT NULL, thumbnail TEXT NOT NULL
      );
      PRAGMA user_version = 4; COMMIT;`);
  }

  const savedStrip = db.prepare('SELECT * FROM strips WHERE id = ?');
  const sessionPhotos =
    db.prepare(`SELECT id, created_at AS createdAt, width, height, thumbnail, filename
    FROM photos WHERE session_id = ? ORDER BY created_at, rowid`);
  function readStrip(id: string, originals = false): StripRecord {
    if (!validId.test(id)) throw new Error('Invalid strip ID');
    const saved = savedStrip.get(id);
    if (saved)
      return {
        id,
        createdAt: String(saved.created_at),
        preview: String(saved.thumbnail),
        photos: JSON.parse(String(saved.photos_json)) as StripRecord['photos'],
      };
    const rows = sessionPhotos.all(id);
    if (!rows.length || rows.length > 4) throw new Error('Strip not found');
    return {
      id,
      createdAt: String(rows[0].createdAt),
      photos: rows.map((row) => ({
        id: String(row.id),
        createdAt: String(row.createdAt),
        width: Number(row.width),
        height: Number(row.height),
        thumbnail: originals
          ? `data:image/jpeg;base64,${readFileSync(path.join(photoDirectory, String(row.filename))).toString('base64')}`
          : String(row.thumbnail),
      })),
    };
  }

  const allStrips = `SELECT id, created_at FROM strips UNION ALL
    SELECT session_id AS id, MIN(created_at) AS created_at FROM photos
    WHERE session_id NOT IN (SELECT id FROM strips) GROUP BY session_id`;

  function filesIn(folder: string) {
    try {
      return new Set(
        readdirSync(folder, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) =>
            process.platform === 'win32'
              ? entry.name.toLowerCase()
              : entry.name,
          ),
      );
    } catch (error) {
      if (
        ['ENOENT', 'ENOTDIR'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      )
        return new Set<string>();
      throw error;
    }
  }
  function fileExists(files: Set<string>, filename: string) {
    return files.has(
      process.platform === 'win32' ? filename.toLowerCase() : filename,
    );
  }

  return {
    directory,
    stripDirectory,
    templates: createTemplateStore(db, directory, included),
    read(): LibraryInfo {
      // Metadata is retained so restoring the original file makes it visible again.
      // Check availability before taking the latest 12, including legacy sessions.
      const stripFiles = filesIn(stripDirectory);
      const photoFiles = filesIn(photoDirectory);
      const savedIds = new Set(
        db
          .prepare('SELECT id FROM strips')
          .all()
          .map((row) => String(row.id)),
      );
      const legacy = new Map<string, { count: number; complete: boolean }>();
      for (const photo of db
        .prepare('SELECT session_id, filename FROM photos')
        .all()) {
        const id = String(photo.session_id);
        const state = legacy.get(id) ?? { count: 0, complete: true };
        state.count++;
        state.complete =
          state.complete && fileExists(photoFiles, String(photo.filename));
        legacy.set(id, state);
      }
      const available = db
        .prepare(
          `SELECT id FROM (${allStrips}) ORDER BY created_at DESC, id DESC`,
        )
        .all()
        .map((row) => String(row.id))
        .filter((id) => {
          if (!validId.test(id)) return false;
          if (savedIds.has(id))
            return fileExists(stripFiles, `VYORA-${id}.jpg`);
          const session = legacy.get(id);
          return !!session?.complete && session.count > 0 && session.count <= 4;
        });
      return {
        directory,
        photoCount: Number(
          db.prepare('SELECT COUNT(*) AS count FROM photos').get()!.count,
        ),
        photos: db
          .prepare(`SELECT id, created_at AS createdAt, width, height, thumbnail
          FROM photos ORDER BY created_at DESC, rowid DESC LIMIT 12`)
          .all()
          .map((row) => ({
            id: String(row.id),
            createdAt: String(row.createdAt),
            width: Number(row.width),
            height: Number(row.height),
            thumbnail: String(row.thumbnail),
          })),
        stripCount: available.length,
        strips: available.slice(0, 12).map((id) => readStrip(id)),
      };
    },
    readStrip,
    saveStrip(strip: StripRecord, jpeg: Buffer, thumbnail: string) {
      if (
        !validId.test(strip.id) ||
        strip.photos.length < 1 ||
        strip.photos.length > 4 ||
        jpeg.length < 4 ||
        jpeg[0] !== 0xff ||
        jpeg[1] !== 0xd8 ||
        jpeg[jpeg.length - 2] !== 0xff ||
        jpeg[jpeg.length - 1] !== 0xd9
      ) {
        throw new Error('Invalid strip JPEG');
      }
      if (savedStrip.get(strip.id)) return this.stripFile(strip.id);
      const filename = `VYORA-${strip.id}.jpg`;
      const target = path.join(stripDirectory, filename);
      const temporary = `${target}.${randomUUID()}.tmp`;
      const alreadyExists = existsSync(target); // An older build may have exported this legacy session.
      try {
        writeFileSync(temporary, jpeg, { flag: 'wx', flush: true });
        renameSync(temporary, target);
        db.prepare(`INSERT INTO strips (id, created_at, photos_json, thumbnail, filename)
          VALUES (?, ?, ?, ?, ?)`).run(
          strip.id,
          strip.createdAt,
          JSON.stringify(
            strip.photos.map((photo) => ({ ...photo, thumbnail: '' })),
          ),
          thumbnail,
          filename,
        );
      } catch (error) {
        try {
          unlinkSync(temporary);
        } catch {
          /* A failed write may not create a file. */
        }
        if (!alreadyExists) {
          try {
            unlinkSync(target);
          } catch {
            /* No completed file yet. */
          }
        }
        throw error;
      }
      return target;
    },
    stripFile(id: string) {
      if (!validId.test(id) || !savedStrip.get(id))
        throw new Error('Saved strip not found');
      const target = path.join(stripDirectory, `VYORA-${id}.jpg`);
      if (!existsSync(target))
        throw new Error('The saved strip file is missing.');
      return target;
    },
    close() {
      db.close();
    },
  };
}
