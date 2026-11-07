import type {
  PrinterDevice,
  PrinterSettings,
  PrintJob,
  PrinterState,
  PaperRecord,
  SheetPlacement,
} from '@vyora/shared';
import {
  checkPaperProfile,
  sheetDocument,
  validatePlacements,
} from './paper-layout.ts';
import type { PrintTarget } from './print-window';
import {
  PrintError,
  PrintUncertainError,
  printDocument,
  printGeometry,
  sheetPhotoSize,
  validatePrinterSettings,
  validatePrintRequest,
} from './print-layout.ts';
import type { ImageSize } from './print-layout.ts';

export interface PrintAdapter {
  list(): Promise<PrinterDevice[]>;
  readStrip(id: string): Promise<{ jpeg: string; size: ImageSize }>;
  submit(
    html: string,
    settings: PrinterSettings,
    signal: AbortSignal,
    onSubmitting: () => void,
    target?: PrintTarget,
  ): Promise<void>;
}
export interface PrinterStore {
  read(): Promise<{ settings: PrinterSettings | null; issue: string }>;
  write(settings: PrinterSettings): Promise<void>;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (cause: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(cause);
      },
    );
  });
}

export class PrinterService {
  private adapter: PrintAdapter;
  private store: PrinterStore;
  private settings: PrinterSettings | null = null;
  private settingsIssue = '';
  private saving = false;
  private active: AbortController | null = null;
  private lastJob: PrintJob | null = null;
  private jobs = new Map<string, PrintJob>();
  private closed = false;
  private listeners = new Set<
    (job: PrintJob, mayHavePrinted: boolean) => void
  >();

  configuration() {
    return this.settings ? structuredClone(this.settings) : null;
  }
  subscribe(listener: (job: PrintJob, mayHavePrinted: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(job: PrintJob, mayHavePrinted: boolean) {
    for (const listener of this.listeners) listener({ ...job }, mayHavePrinted);
  }

  constructor(adapter: PrintAdapter, store: PrinterStore) {
    this.adapter = adapter;
    this.store = store;
  }

  async initialize() {
    const saved = await this.store.read();
    this.settings = saved.settings;
    this.settingsIssue = saved.issue;
  }

  private async list() {
    if (this.closed) throw new PrintError('Printing is shutting down.');
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new PrintError(
            'Windows did not return the printer list. Check your printers and try Refresh.',
          ),
        ),
      5000,
    );
    try {
      return await abortable(this.adapter.list(), controller.signal);
    } catch (cause) {
      if (cause instanceof PrintError) throw cause;
      throw new PrintError(
        'Could not detect Windows printers. Check your printer installation and try Refresh.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async state(): Promise<PrinterState> {
    const devices = await this.list();
    return {
      devices,
      settings: this.settings && { ...this.settings },
      settingsIssue: this.settingsIssue,
      busy: !!this.active || this.saving,
      job: this.lastJob && { ...this.lastJob },
    };
  }

  activity(): Pick<PrinterState, 'busy' | 'job'> {
    return {
      busy: !!this.active || this.saving,
      job: this.lastJob && { ...this.lastJob },
    };
  }

  async measureSheetPhoto(id: string) {
    const { size } = await abortable(
      this.adapter.readStrip(id),
      AbortSignal.timeout(15000),
    );
    return sheetPhotoSize(size);
  }

  acknowledgeSheet(id: string, printed: boolean) {
    if (
      this.active ||
      this.lastJob?.id !== id ||
      !this.lastJob.paperId ||
      this.lastJob.status !== 'uncertain'
    )
      return;
    this.lastJob.status = printed ? 'submitted' : 'failed';
    this.lastJob.message =
      'The operator checked the physical sheet and print queue.';
  }

  async save(input: unknown) {
    const settings = validatePrinterSettings(input);
    if (this.active || this.saving)
      throw new PrintError('Wait for the current printer operation to finish.');
    this.saving = true;
    try {
      const devices = await this.list();
      if (!devices.some((device) => device.name === settings.deviceName))
        throw new PrintError(
          'This printer is no longer detected. Select Refresh and choose your printer.',
        );
      try {
        await this.store.write(settings);
      } catch {
        throw new PrintError(
          'Could not save printer settings. Check available disk space and folder permissions.',
        );
      }
      this.settings = settings;
      this.settingsIssue = '';
      return { ...settings };
    } finally {
      this.saving = false;
    }
  }

  start(input: unknown): PrintJob {
    const { id, requestId } = validatePrintRequest(input);
    if (this.closed) throw new PrintError('Printing is shutting down.');
    const previous = this.jobs.get(requestId);
    if (previous) {
      if (previous.stripId !== id)
        throw new PrintError('This print request belongs to another strip.');
      return { ...previous };
    }
    if (this.active || this.saving)
      throw new PrintError(
        'Another print job is still being prepared or submitted.',
      );
    if (this.lastJob?.status === 'uncertain')
      throw new PrintError(
        'Print status is unknown. Check the Windows print queue and reopen VYORA before submitting another job.',
      );
    if (!this.settings)
      throw new PrintError(
        'Choose and save a printer in Printer settings first.',
      );
    if (this.settings.layout === 'sheet')
      throw new PrintError(
        'Add this strip to Paper & layout to print on a full sheet.',
      );
    const settings = { ...this.settings };
    const job: PrintJob = {
      id: requestId,
      stripId: id,
      status: 'preparing',
      message: 'Preparing your strip…',
      printerName: settings.deviceName,
      sheets: settings.copies,
      stripsPerSheet: 1,
    };
    this.lastJob = job;
    this.jobs.set(requestId, job);
    // A bounded replay cache stops repeated IPC requests from submitting twice.
    if (this.jobs.size > 100) this.jobs.delete(this.jobs.keys().next().value!);
    const controller = new AbortController();
    this.active = controller;
    void this.run(job, settings, controller);
    return { ...job };
  }

  startSheet(id: string, paper: PaperRecord, placements: SheetPlacement[]) {
    validatePlacements(paper, placements);
    validatePrintRequest({ id: placements[0].stripId, requestId: id });
    const previous = this.jobs.get(id);
    if (previous) {
      if (previous.paperId !== paper.id)
        throw new PrintError('This request belongs to another sheet.');
      return { ...previous };
    }
    if (this.closed || this.active || this.saving)
      throw new PrintError('Wait for the current printer operation to finish.');
    if (this.lastJob?.status === 'uncertain')
      throw new PrintError(
        'Check the Windows print queue and reopen VYORA before printing again.',
      );
    const settings = this.configuration();
    if (
      !settings ||
      settings.layout !== 'sheet' ||
      settings.deviceName !== paper.deviceName
    )
      throw new PrintError(
        'Select Full sheets and the matching printer in Printer settings.',
      );
    checkPaperProfile(
      paper.spec,
      settings.deviceName,
      settings.customPaperProfile,
    );
    const job: PrintJob = {
      id,
      stripId: placements[0].stripId,
      paperId: paper.id,
      status: 'preparing',
      message: 'Preparing your print sheet…',
      printerName: settings.deviceName,
      sheets: 1,
      stripsPerSheet: placements.length,
    };
    this.lastJob = job;
    this.jobs.set(id, job);
    if (this.jobs.size > 100) this.jobs.delete(this.jobs.keys().next().value!);
    const controller = new AbortController();
    this.active = controller;
    void this.run(job, settings, controller, {
      paper: structuredClone(paper),
      placements: structuredClone(placements),
    });
    return { ...job };
  }

  private async run(
    job: PrintJob,
    settings: PrinterSettings,
    controller: AbortController,
    sheet?: { paper: PaperRecord; placements: SheetPlacement[] },
  ) {
    let submitted = false;
    let timeout = setTimeout(
      () =>
        controller.abort(
          new PrintError(
            'Print preparation timed out. Check your printer connection and try again.',
          ),
        ),
      15000,
    );
    try {
      this.emit(job, false);
      const devices = await abortable(this.list(), controller.signal);
      if (!devices.some((device) => device.name === settings.deviceName))
        throw new PrintError(
          'Your saved printer is not detected. Open Printer settings to reconnect it or choose another.',
        );
      let html: string;
      let target: PrintTarget;
      if (sheet) {
        const images = new Map<string, string>();
        let bytes = 0;
        for (const p of sheet.placements) {
          if (images.has(p.stripId)) continue;
          const { jpeg } = await abortable(
            this.adapter.readStrip(p.stripId),
            controller.signal,
          );
          bytes += jpeg.length;
          if (bytes > 40 * 1024 * 1024)
            throw new PrintError(
              'Sheet images are too large. Print fewer strips at a time.',
            );
          images.set(p.stripId, jpeg);
        }
        html = sheetDocument(sheet.paper, sheet.placements, images);
        target = {
          pageSize: {
            width: sheet.paper.spec.width,
            height: sheet.paper.spec.height,
          },
          images: sheet.placements.length,
        };
      } else {
        const { jpeg, size } = await abortable(
          this.adapter.readStrip(job.stripId),
          controller.signal,
        );
        const geometry = printGeometry(settings.layout, size);
        job.stripsPerSheet = geometry.columns;
        target = { pageSize: geometry.pageSize, images: geometry.columns };
        html = printDocument(jpeg, settings, size);
      }
      await this.adapter.submit(
        html,
        settings,
        controller.signal,
        () => {
          controller.signal.throwIfAborted();
          submitted = true;
          clearTimeout(timeout);
          job.status = 'submitting';
          job.message = 'Sending to printer…';
          this.emit(job, true);
          // A timeout after submission is ambiguous: keep the job locked until
          // the native callback returns. Never automatically send a second job.
          timeout = setTimeout(() => {
            job.status = 'uncertain';
            job.message =
              'The printer has not confirmed this job. Check the Windows print queue; VYORA will not resend it automatically.';
            this.emit(job, true);
          }, 60000);
        },
        target,
      );
      job.status = 'submitted';
      job.message =
        'Sent to printer. Collect your prints when printing finishes.';
    } catch (cause) {
      job.status =
        submitted &&
        (controller.signal.aborted || cause instanceof PrintUncertainError)
          ? 'uncertain'
          : 'failed';
      job.message =
        job.status === 'uncertain'
          ? 'Print status is unknown. Check the Windows print queue before printing again.'
          : cause instanceof PrintError
            ? cause.message
            : 'Could not print this saved strip. Check the printer and its paper settings before trying again.';
    } finally {
      clearTimeout(timeout);
      if (this.active === controller) this.active = null;
      this.emit(job, submitted);
    }
  }

  dispose() {
    this.closed = true;
    this.active?.abort(
      new PrintError('Printing stopped because VYORA closed.'),
    );
  }
}
