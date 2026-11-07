import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { StripTemplate, StripTemplateSummary } from '@vyora/shared';
import { validateTemplate } from '../template-layout.ts';

export interface IncludedTemplates {
  list(): StripTemplateSummary[];
  get(id: string): StripTemplate | undefined;
  has(id: string): boolean;
}

interface FrameEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  slots: StripTemplate['slots'];
  file: string;
  preview: string;
}

const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

// Shipped assets stay separate from the user's editable template library.
// Full-resolution frames are loaded only when selected, not for every picker item.
export function createIncludedTemplates(directory: string): IncludedTemplates {
  const entries: unknown = JSON.parse(
    readFileSync(path.join(directory, 'index.json'), 'utf8'),
  );
  if (!Array.isArray(entries) || entries.length !== 25)
    throw new Error('The included VYORA frame collection is incomplete.');
  const catalog = new Map<string, FrameEntry>();
  for (const entry of entries as FrameEntry[]) {
    if (
      !entry ||
      !/^vyora-free-[a-z-]+-[234]$/.test(entry.id) ||
      catalog.has(entry.id) ||
      !/^[a-z0-9-]+\.png$/.test(entry.file) ||
      !/^[a-z0-9-]+\.png$/.test(entry.preview)
    )
      throw new Error('Invalid included VYORA frame entry.');
    const draft = validateTemplate({
      ...entry,
      frame: 'data:image/png;base64,aGVsbG8=',
      layer: 'overlay',
    });
    if (draft.slots.length !== Number(entry.id.slice(-1)))
      throw new Error(
        'The included frame has the wrong number of photo areas.',
      );
    catalog.set(entry.id, { ...entry, ...draft });
  }
  function readPng(filename: string) {
    const png = readFileSync(path.join(directory, filename));
    if (png.length < 24 || !png.subarray(0, 8).equals(pngHeader))
      throw new Error('An included VYORA frame cannot be read.');
    return png;
  }
  const summaries = [...catalog.values()].map((entry) => ({
    id: entry.id,
    name: entry.name,
    width: entry.width,
    height: entry.height,
    slots: entry.slots,
    layer: 'overlay' as const,
    builtIn: true,
    preview: `data:image/png;base64,${readPng(entry.preview).toString('base64')}`,
  }));
  return {
    has: (id) => catalog.has(id),
    list: () => structuredClone(summaries),
    get(id) {
      const entry = catalog.get(id);
      if (!entry) return undefined;
      const png = readPng(entry.file);
      if (
        png.readUInt32BE(16) !== entry.width ||
        png.readUInt32BE(20) !== entry.height
      )
        throw new Error('Included frame dimensions do not match its artwork.');
      return {
        id,
        builtIn: true,
        ...validateTemplate({
          ...entry,
          frame: `data:image/png;base64,${png.toString('base64')}`,
          layer: 'overlay',
        }),
      };
    },
  };
}
