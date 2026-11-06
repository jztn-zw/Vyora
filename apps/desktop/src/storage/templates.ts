import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  StripTemplate,
  StripTemplateDraft,
  StripTemplateSummary,
} from '@vyora/shared';
import { validateTemplate } from '../template-layout.ts';
import type { IncludedTemplates } from './included-templates';

export function createTemplateStore(
  db: DatabaseSync,
  directory: string,
  included?: IncludedTemplates,
) {
  const templateDirectory = path.join(directory, 'templates');
  function list(): StripTemplateSummary[] {
    const custom = db
      .prepare(
        'SELECT id, name, width, height, slots_json, layer, thumbnail FROM templates ORDER BY rowid DESC',
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        width: Number(row.width),
        height: Number(row.height),
        slots: JSON.parse(String(row.slots_json)),
        layer: row.layer as 'overlay' | 'background',
        preview: String(row.thumbnail),
      }));
    return [...(included?.list() ?? []), ...custom];
  }
  function get(id: string): StripTemplate {
    const bundled = included?.get(id);
    if (bundled) return bundled;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid template ID.');
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!row) throw new Error('Template not found.');
    const draft = validateTemplate({
      name: row.name,
      width: Number(row.width),
      height: Number(row.height),
      slots: JSON.parse(String(row.slots_json)),
      layer: row.layer,
      frame: `data:image/png;base64,${readFileSync(path.join(templateDirectory, `${id}.png`)).toString('base64')}`,
    });
    return { id, ...draft };
  }
  function save(
    input: StripTemplateDraft,
    png: Buffer,
    thumbnail: string,
  ): StripTemplate {
    const draft = validateTemplate(input);
    if (
      Number(
        db.prepare('SELECT COUNT(*) AS count FROM templates').get()!.count,
      ) >= 50
    )
      throw new Error('The local template library is limited to 50 templates.');
    mkdirSync(templateDirectory, { recursive: true });
    const id = randomUUID();
    const target = path.join(templateDirectory, `${id}.png`),
      temporary = `${target}.tmp`;
    try {
      writeFileSync(temporary, png, { flag: 'wx', flush: true });
      renameSync(temporary, target);
      db.prepare(
        'INSERT INTO templates (id, name, width, height, slots_json, layer, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        draft.name,
        draft.width,
        draft.height,
        JSON.stringify(draft.slots),
        draft.layer,
        thumbnail,
      );
    } catch (error) {
      for (const file of [temporary, target]) {
        try {
          unlinkSync(file);
        } catch {
          /* No file after an unsuccessful write. */
        }
      }
      throw error;
    }
    return { id, ...draft };
  }
  function update(id: string, input: StripTemplateDraft): StripTemplate {
    if (included?.has(id))
      throw new Error('Included VYORA frames cannot be overwritten.');
    const existing = get(id);
    const draft = validateTemplate(input);
    if (
      draft.frame !== existing.frame ||
      draft.width !== existing.width ||
      draft.height !== existing.height
    )
      throw new Error('Upload a new template to replace the frame artwork.');
    db.prepare(
      'UPDATE templates SET name = ?, slots_json = ?, layer = ? WHERE id = ?',
    ).run(draft.name, JSON.stringify(draft.slots), draft.layer, id);
    return { id, ...draft };
  }
  function remove(id: string) {
    if (included?.has(id))
      throw new Error('Included VYORA frames cannot be removed.');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid template ID.');
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    try {
      unlinkSync(path.join(templateDirectory, `${id}.png`));
    } catch {
      /* Removing the picker entry succeeds even if asset cleanup is unavailable. */
    }
  }
  return { list, get, save, update, remove };
}
