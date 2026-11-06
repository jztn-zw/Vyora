import { randomUUID } from 'node:crypto';
import type {
  PaperState,
  PaperRecord,
  PrintJob,
  SheetBatch,
} from '@vyora/shared';
import { PrintError } from './print-layout.ts';
import {
  arrangePaper,
  checkPaperProfile,
  validUuid,
  validateAreas,
  validatePaperSpec,
} from './paper-layout.ts';
import { emptyPaperData, validatePaperData } from './paper-store.ts';
import type { PaperData, PaperStore } from './paper-store.ts';
import type { PrinterService } from './printer-service.ts';

const pending = (b: SheetBatch) =>
  ['reserved', 'sent', 'check'].includes(b.status);
export class PaperService {
  private data = emptyPaperData();
  private issue = '';
  private tail: Promise<void> = Promise.resolve();
  private store: PaperStore;
  private printers: PrinterService;
  private assertStrip: (id: string) => void;
  private unsubscribe: () => void;
  constructor(
    store: PaperStore,
    printers: PrinterService,
    assertStrip: (id: string) => void,
  ) {
    this.store = store;
    this.printers = printers;
    this.assertStrip = assertStrip;
    this.unsubscribe = printers.subscribe((job, mayHavePrinted) => {
      if (job.paperId) void this.updateJob(job, mayHavePrinted);
    });
  }
  async initialize() {
    const saved = await this.store.read();
    this.data = saved.data;
    this.issue = saved.issue;
    if (!this.issue && this.data.batches.some(pending))
      try {
        await this.change((d) => {
          for (const b of d.batches.filter(pending)) {
            b.status = 'check';
            b.message =
              'Interrupted print. Check the Windows queue and this physical sheet before resolving it.';
          }
        });
      } catch {
        this.issue =
          'Paper recovery could not be saved. Sheet printing is disabled; preserve the paper records for recovery.';
      }
  }
  private change(action: (draft: PaperData) => void) {
    const operation = this.tail.then(async () => {
      if (this.issue) throw new PrintError(this.issue);
      const draft = structuredClone(this.data);
      action(draft);
      validatePaperData(draft);
      try {
        await this.store.write(draft);
      } catch {
        throw new PrintError(
          'Could not save the paper records. Nothing new will be sent until they can be saved.',
        );
      }
      this.data = draft;
    });
    this.tail = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  async state(): Promise<PaperState> {
    await this.tail;
    const { adds: _adds, ...state } = structuredClone(this.data);
    return { ...state, issue: this.issue };
  }
  private configured() {
    const s = this.printers.configuration();
    if (!s || s.layout !== 'sheet')
      throw new PrintError(
        'Choose Full sheets and save your printer in Printer settings first.',
      );
    return s;
  }
  private paper(d: PaperData, id: unknown) {
    if (!validUuid(id)) throw new PrintError('Invalid paper record.');
    const p = d.papers.find((paper) => paper.id === id);
    if (!p)
      throw new PrintError(
        'This paper record is no longer available. Refresh the layout.',
      );
    return p;
  }
  async add(input: unknown) {
    const v = input as { id: string; requestId: string; copies: number } | null;
    if (
      !v ||
      !validUuid(v.id) ||
      !validUuid(v.requestId) ||
      !Number.isInteger(v.copies) ||
      v.copies < 1 ||
      v.copies > 10
    )
      throw new PrintError('Choose 1–10 copies of a saved strip.');
    await this.change((d) => {
      const previous = d.adds.find((a) => a.id === v.requestId);
      if (previous) {
        if (previous.stripId !== v.id || previous.copies !== v.copies)
          throw new PrintError('This queue request was already used.');
        return;
      }
      this.assertStrip(v.id);
      if (d.queue.length + v.copies > 100)
        throw new PrintError(
          'The print queue is full (100 strips). Print or remove some queued strips first.',
        );
      for (let i = 0; i < v.copies; i++)
        d.queue.push({ id: randomUUID(), stripId: v.id });
      d.adds.push({ id: v.requestId, stripId: v.id, copies: v.copies });
      if (d.adds.length > 100) d.adds.shift();
    });
    return this.state();
  }
  async remove(input: unknown) {
    if (!validUuid(input)) throw new PrintError('Invalid queued strip.');
    await this.change((d) => {
      if (
        d.batches.some(
          (b) => pending(b) && b.placements.some((p) => p.queueId === input),
        )
      )
        throw new PrintError(
          'Check the submitted sheet before removing this strip.',
        );
      d.queue = d.queue.filter((q) => q.id !== input);
    });
    return this.state();
  }
  async create(input: unknown) {
    const v = input as { name: string; spec: unknown } | null;
    if (
      !v ||
      typeof v.name !== 'string' ||
      !v.name.trim() ||
      v.name.length > 80
    )
      throw new PrintError(
        'Name this physical sheet or leftover piece (up to 80 characters).',
      );
    const spec = validatePaperSpec(v.spec);
    await this.change((d) => {
      const s = this.configured();
      checkPaperProfile(spec, s.deviceName, s.customPaperProfile);
      if (d.papers.length >= 40)
        throw new PrintError(
          'Remove an old sheet record before adding another (40 maximum).',
        );
      const paper: PaperRecord = {
        id: randomUUID(),
        name: v.name.trim(),
        deviceName: s.deviceName,
        spec,
        blocked: [],
        used: [],
        revision: 0,
      };
      d.papers.push(paper);
      d.activePaperId = paper.id;
    });
    return this.state();
  }
  async select(input: unknown) {
    await this.change((d) => {
      this.paper(d, input);
      d.activePaperId = input as string;
    });
    return this.state();
  }
  async mark(input: unknown) {
    const v = input as {
      paperId: string;
      revision: number;
      blocked: unknown;
    } | null;
    if (!v) throw new PrintError('Invalid marked paper areas.');
    await this.change((d) => {
      const p = this.paper(d, v.paperId);
      if (d.batches.some((b) => b.paperId === p.id && pending(b)))
        throw new PrintError(
          'Check the submitted print before changing this sheet.',
        );
      if (p.revision !== v.revision)
        throw new PrintError(
          'This paper changed. Refresh before marking it again.',
        );
      p.blocked = validateAreas(v.blocked, p.spec);
      p.revision++;
    });
    return this.state();
  }
  async delete(input: unknown) {
    await this.change((d) => {
      const p = this.paper(d, input);
      if (d.batches.some((b) => b.paperId === p.id && pending(b)))
        throw new PrintError(
          'Check the submitted print before discarding its paper record.',
        );
      d.papers = d.papers.filter((paper) => paper.id !== p.id);
      d.batches = d.batches.filter((b) => b.paperId !== p.id);
      if (d.activePaperId === p.id) d.activePaperId = null;
    });
    return this.state();
  }
  async print(input: unknown) {
    const v = input as {
      paperId: string;
      revision: number;
      requestId: string;
      loaded: boolean;
    } | null;
    if (!v || !validUuid(v.requestId) || v.loaded !== true)
      throw new PrintError(
        'Confirm that the selected physical sheet is loaded in the shown feed direction.',
      );
    let launch: { paper: PaperRecord; batch: SheetBatch } | null = null;
    await this.change((d) => {
      const prior = d.batches.find((b) => b.id === v.requestId);
      if (prior) {
        if (prior.paperId !== v.paperId)
          throw new PrintError(
            'This print request belongs to another paper record.',
          );
        return;
      }
      if (this.printers.activity().busy || d.batches.some(pending))
        throw new PrintError(
          'Finish or check the previous sheet print before submitting another.',
        );
      const p = this.paper(d, v.paperId);
      const s = this.configured();
      if (s.deviceName !== p.deviceName)
        throw new PrintError(
          'This paper belongs to another printer. Select its printer before printing.',
        );
      checkPaperProfile(p.spec, s.deviceName, s.customPaperProfile);
      if (p.revision !== v.revision)
        throw new PrintError(
          'This sheet changed. Refresh the preview before printing.',
        );
      const placements = arrangePaper(p, d.queue);
      if (!placements.length)
        throw new PrintError(
          'No queued 2 × 6-inch strips fit in this paper’s remaining printable area.',
        );
      const batch: SheetBatch = {
        id: v.requestId,
        paperId: p.id,
        placements,
        status: 'reserved',
        message: 'Preparing this sheet. Its positions are reserved.',
      };
      if (d.batches.length >= 100) {
        const i = d.batches.findIndex((b) => !pending(b));
        if (i < 0) throw new PrintError('Resolve previous prints first.');
        d.batches.splice(i, 1);
      }
      d.batches.push(batch);
      launch = { paper: structuredClone(p), batch: structuredClone(batch) };
    });
    const start = launch as { paper: PaperRecord; batch: SheetBatch } | null;
    if (start) {
      try {
        this.printers.startSheet(
          start.batch.id,
          start.paper,
          start.batch.placements,
        );
      } catch (cause) {
        await this.change((d) => {
          const b = d.batches.find((b) => b.id === v.requestId)!;
          b.status = 'released';
          b.message = 'Nothing was submitted. The strips remain queued.';
        });
        throw cause;
      }
    }
    return this.state();
  }
  private async updateJob(job: PrintJob, mayHavePrinted: boolean) {
    try {
      await this.change((d) => {
        const b = d.batches.find((b) => b.id === job.id);
        if (!b || !pending(b)) return;
        b.message = job.message;
        if (job.status === 'preparing') b.status = 'reserved';
        else if (job.status === 'submitting') b.status = 'sent';
        else if (job.status === 'failed' && !mayHavePrinted)
          b.status = 'released';
        else {
          b.status = 'check';
          b.message = `${job.message} Check this sheet before reusing its positions.`;
        }
      });
    } catch {
      this.issue =
        'Could not save a print outcome. Sheet printing is disabled; check the physical paper and preserve the paper records for recovery.';
    }
  }
  async resolve(input: unknown) {
    const v = input as {
      batchId: string;
      result: 'printed' | 'blank' | 'spoiled';
    } | null;
    if (
      !v ||
      !validUuid(v.batchId) ||
      !['printed', 'blank', 'spoiled'].includes(v.result)
    )
      throw new PrintError('Choose how this physical print came out.');
    await this.change((d) => {
      const b = d.batches.find((batch) => batch.id === v.batchId);
      if (!b) throw new PrintError('Print batch not found.');
      const target =
        v.result === 'printed'
          ? 'printed'
          : v.result === 'blank'
            ? 'released'
            : 'spoiled';
      if (b.status === target) return;
      if (b.status !== 'check' || this.printers.activity().busy)
        throw new PrintError(
          'Wait for the printer response or check the Windows queue before reopening VYORA to resolve an interrupted job.',
        );
      const p = this.paper(d, b.paperId);
      if (v.result !== 'blank') {
        p.used.push(
          ...b.placements.map(({ x, y, width, height }) => ({
            x,
            y,
            width,
            height,
          })),
        );
        p.revision++;
      }
      if (v.result === 'printed') {
        const ids = new Set(b.placements.map((p) => p.queueId));
        d.queue = d.queue.filter((q) => !ids.has(q.id));
      }
      b.status = target;
      b.message =
        v.result === 'printed'
          ? 'Printed positions recorded as used.'
          : v.result === 'blank'
            ? 'Confirmed blank. Strips remain queued.'
            : 'Spoiled positions recorded as used. Strips remain queued for reprinting.';
    });
    this.printers.acknowledgeSheet(v.batchId, v.result === 'printed');
    return this.state();
  }
  dispose() {
    this.unsubscribe();
  }
}
