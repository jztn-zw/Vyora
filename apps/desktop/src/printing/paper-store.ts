import { readFile, stat, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PaperState } from '@vyora/shared';
import { PrintError } from './print-layout.ts';
import {
  validUuid,
  validatePaperSpec,
  validateAreas,
  validatePlacements,
} from './paper-layout.ts';

export interface PaperData extends Omit<PaperState, 'issue'> {
  adds: { id: string; stripId: string; copies: number }[];
}
export const emptyPaperData = (): PaperData => ({
  papers: [],
  queue: [],
  batches: [],
  activePaperId: null,
  adds: [],
});
export function validatePaperData(input: unknown): PaperData {
  const d = input as PaperData | null;
  if (
    !d ||
    !Array.isArray(d.papers) ||
    d.papers.length > 40 ||
    !Array.isArray(d.queue) ||
    d.queue.length > 100 ||
    !Array.isArray(d.batches) ||
    d.batches.length > 100 ||
    !Array.isArray(d.adds) ||
    d.adds.length > 100
  )
    throw new PrintError('Invalid saved paper state.');
  const paperIds = new Set<string>();
  const queueIds = new Set<string>();
  const batchIds = new Set<string>();
  const reserved = new Set<string>();
  const addIds = new Set<string>();
  let pendingBatches = 0;
  for (const p of d.papers) {
    if (
      !p ||
      !validUuid(p.id) ||
      paperIds.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 80 ||
      typeof p.deviceName !== 'string' ||
      !p.deviceName ||
      p.deviceName.length > 512 ||
      !Number.isSafeInteger(p.revision) ||
      p.revision < 0
    )
      throw new PrintError('Invalid paper record.');
    paperIds.add(p.id);
    validatePaperSpec(p.spec);
    validateAreas(p.blocked, p.spec);
    validateAreas(p.used, p.spec);
  }
  for (const q of d.queue) {
    if (!q || !validUuid(q.id) || !validUuid(q.stripId) || queueIds.has(q.id))
      throw new PrintError('Invalid saved strip queue.');
    queueIds.add(q.id);
  }
  for (const b of d.batches) {
    const paper = d.papers.find((p) => p.id === b?.paperId);
    if (
      !b ||
      !validUuid(b.id) ||
      batchIds.has(b.id) ||
      !paper ||
      !['reserved', 'sent', 'check', 'printed', 'released', 'spoiled'].includes(
        b.status,
      ) ||
      typeof b.message !== 'string' ||
      b.message.length > 1000 ||
      !Array.isArray(b.placements) ||
      !b.placements.length ||
      b.placements.length > 16
    )
      throw new PrintError('Invalid saved print batch.');
    batchIds.add(b.id);
    if (['reserved', 'sent', 'check'].includes(b.status)) {
      if (++pendingBatches > 1)
        throw new PrintError(
          'More than one sheet has unresolved print positions.',
        );
      validatePlacements(paper, b.placements);
    }
    const local = new Set<string>();
    for (const p of b.placements) {
      validateAreas([p], paper.spec);
      if (
        !validUuid(p.queueId) ||
        !validUuid(p.stripId) ||
        typeof p.rotated !== 'boolean' ||
        local.has(p.queueId)
      )
        throw new PrintError('Invalid saved batch placement.');
      local.add(p.queueId);
      if (['reserved', 'sent', 'check'].includes(b.status)) {
        if (
          reserved.has(p.queueId) ||
          !d.queue.some((q) => q.id === p.queueId && q.stripId === p.stripId)
        )
          throw new PrintError('Invalid reserved queue entry.');
        reserved.add(p.queueId);
      }
    }
  }
  for (const a of d.adds) {
    if (
      !a ||
      !validUuid(a.id) ||
      !validUuid(a.stripId) ||
      !Number.isInteger(a.copies) ||
      a.copies < 1 ||
      a.copies > 10 ||
      addIds.has(a.id)
    )
      throw new PrintError('Invalid saved queue operation.');
    addIds.add(a.id);
  }
  if (d.activePaperId !== null && !paperIds.has(d.activePaperId))
    throw new PrintError('The selected paper record is missing.');
  return structuredClone(d);
}
export interface PaperStore {
  read(): Promise<{ data: PaperData; issue: string }>;
  write(data: PaperData): Promise<void>;
}
export function paperStateStore(directory: string): PaperStore {
  const filename = path.join(directory, 'paper-state.json');
  return {
    async read() {
      try {
        if ((await stat(filename)).size > 2 * 1024 * 1024)
          throw new Error('Oversized paper state');
        const text = await readFile(filename, 'utf8');
        if (text.length > 2 * 1024 * 1024)
          throw new Error('Oversized paper state');
        const parsed = JSON.parse(text);
        if (parsed.version !== 1)
          throw new Error('Unknown paper-state version');
        return { data: validatePaperData(parsed.data), issue: '' };
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
          return { data: emptyPaperData(), issue: '' };
        return {
          data: emptyPaperData(),
          issue:
            'Saved paper records could not be read. Printing sheets is disabled to protect used areas. Keep the file for recovery.',
        };
      }
    },
    async write(data) {
      const valid = validatePaperData(data);
      const text = JSON.stringify({ version: 1, data: valid });
      if (text.length > 2 * 1024 * 1024)
        throw new PrintError(
          'Paper records are full. Remove finished sheet records before adding more.',
        );
      const temporary = path.join(directory, `paper-state-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, text, {
          flag: 'wx',
          mode: 0o600,
          flush: true,
        });
        await rename(temporary, filename);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}
