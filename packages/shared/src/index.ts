export type CaptureTimer = 3 | 5 | 10;
export type ShotCount = 2 | 3 | 4;
export type AppTheme = 'light' | 'dark' | 'vyora';
export type UploadStatus = 'local' | 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface PhotoRecord {
  id: string;
  createdAt: string;
  width: number;
  height: number;
  thumbnail: string;
}

export interface LibraryInfo {
  directory: string;
  photoCount: number;
  photos: PhotoRecord[];
  stripCount: number;
  strips: StripRecord[];
  pendingStrip?: StripRecord;
}

export interface StripRecord {
  id: string;
  createdAt: string;
  photos: PhotoRecord[];
  preview?: string;
  template?: StripTemplate;
}

export interface PhotoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface StripTemplateDraft {
  name: string;
  width: number;
  height: number;
  frame: string;
  slots: PhotoSlot[];
  layer: 'overlay' | 'background';
}

export interface StripTemplate extends StripTemplateDraft {
  id: string;
  builtIn?: boolean;
}

export interface StripTemplateSummary extends Omit<StripTemplate, 'frame'> {
  preview: string;
}

export type DesktopResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface PrinterDevice {
  name: string;
  displayName: string;
}
export interface PrinterSettings {
  deviceName: string;
  layout: 'single-strip' | 'double-strip' | 'sheet';
  copies: number;
  customPaperProfile?: CustomPaperProfile;
}
export interface CustomPaperProfile {
  deviceName: string;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  verified: true;
}
// Physical paper measurements use integer microns, independently of image pixels.
export interface PaperRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PaperSpec {
  kind: 'long-bond' | 'a4' | 'letter' | 'custom';
  width: number;
  height: number;
  margin: number;
  gap: number;
  guides: boolean;
}
export interface PaperRecord {
  id: string;
  name: string;
  deviceName: string;
  spec: PaperSpec;
  blocked: PaperRect[];
  used: PaperRect[];
  revision: number;
}
export interface SheetQueueItem {
  id: string;
  stripId: string;
}
export interface SheetPlacement extends PaperRect {
  queueId: string;
  stripId: string;
  rotated: boolean;
}
export interface SheetBatch {
  id: string;
  paperId: string;
  placements: SheetPlacement[];
  status: 'reserved' | 'sent' | 'check' | 'printed' | 'released' | 'spoiled';
  message: string;
}
export interface PaperState {
  papers: PaperRecord[];
  queue: SheetQueueItem[];
  batches: SheetBatch[];
  activePaperId: string | null;
  issue: string;
}
export interface PrintJob {
  id: string;
  stripId: string;
  status: 'preparing' | 'submitting' | 'submitted' | 'failed' | 'uncertain';
  message: string;
  printerName: string;
  sheets: number;
  stripsPerSheet: number;
  paperId?: string;
}
export interface PrinterState {
  devices: PrinterDevice[];
  settings: PrinterSettings | null;
  settingsIssue: string;
  busy: boolean;
  job: PrintJob | null;
}

export interface DesktopApi {
  connectTetheredCamera(port: number): Promise<DesktopResult<{ serial: string; name: string }>>;
  readTetheredPreview(port: number): Promise<DesktopResult<ArrayBuffer>>;
  captureTetheredPhoto(
    port: number,
    serial: string,
    requestId: string,
    recoveryMs: number,
  ): Promise<DesktopResult<ArrayBuffer>>;
  guestStatus(): Promise<DesktopResult<GuestStatus>>;
  guestConfigure(input: {
    displayId?: number;
    tablet?: boolean;
    approve?: string;
    revoke?: string;
    closeDisplay?: boolean;
  }): Promise<DesktopResult<GuestStatus>>;
  guestPublish(state: GuestSnapshot): Promise<DesktopResult<void>>;
  guestPreview(jpeg: ArrayBuffer): Promise<DesktopResult<void>>;
  onGuestCommand(callback: (command: GuestCommand & { requestId: string }) => void): () => void;
  guestReply(requestId: string, error?: string): void;
  guestRead(): Promise<DesktopResult<GuestSnapshot | null>>;
  guestSend(command: GuestCommand): Promise<DesktopResult<void>>;
  guestReadPreview(): Promise<DesktopResult<string>>;
  getPaperState(): Promise<DesktopResult<PaperState>>;
  addToPrintSheet(
    id: string,
    requestId: string,
    copies?: number,
  ): Promise<DesktopResult<PaperState>>;
  removeFromPrintSheet(queueId: string): Promise<DesktopResult<PaperState>>;
  createPrintPaper(name: string, spec: PaperSpec): Promise<DesktopResult<PaperState>>;
  selectPrintPaper(paperId: string): Promise<DesktopResult<PaperState>>;
  markPrintPaper(
    paperId: string,
    revision: number,
    blocked: PaperRect[],
  ): Promise<DesktopResult<PaperState>>;
  deletePrintPaper(paperId: string): Promise<DesktopResult<PaperState>>;
  printSheet(
    paperId: string,
    revision: number,
    requestId: string,
    loaded: boolean,
  ): Promise<DesktopResult<PaperState>>;
  resolveSheetPrint(
    batchId: string,
    result: 'printed' | 'blank' | 'spoiled',
  ): Promise<DesktopResult<PaperState>>;
  getPrintActivity(): Promise<DesktopResult<Pick<PrinterState, 'busy' | 'job'>>>;
  getPrinterState(): Promise<DesktopResult<PrinterState>>;
  savePrinterSettings(settings: PrinterSettings): Promise<DesktopResult<PrinterSettings>>;
  printStrip(id: string, requestId: string): Promise<DesktopResult<PrintJob>>;
  setTheme(theme: AppTheme): Promise<DesktopResult<void>>;
  getLibrary(): Promise<DesktopResult<LibraryInfo>>;
  stagePhoto(
    jpeg: ArrayBuffer,
    sessionId: string,
    templateId?: string,
  ): Promise<DesktopResult<PhotoRecord>>;
  replacePhoto(
    jpeg: ArrayBuffer,
    sessionId: string,
    photoId: string,
  ): Promise<DesktopResult<PhotoRecord>>;
  listTemplates(): Promise<DesktopResult<StripTemplateSummary[]>>;
  getTemplate(id: string): Promise<DesktopResult<StripTemplate>>;
  saveTemplate(template: StripTemplateDraft): Promise<DesktopResult<StripTemplate>>;
  updateTemplate(id: string, template: StripTemplateDraft): Promise<DesktopResult<StripTemplate>>;
  removeTemplate(id: string): Promise<DesktopResult<void>>;
  getStripSources(id: string): Promise<DesktopResult<StripRecord>>;
  getStripPreview(id: string): Promise<DesktopResult<string>>;
  deleteStrip(id: string): Promise<DesktopResult<void>>;
  saveStrip(id: string, jpeg: ArrayBuffer, reveal?: boolean): Promise<DesktopResult<string>>;
  openStrip(id: string): Promise<DesktopResult<void>>;
  openLibrary(): Promise<DesktopResult<void>>;
}

export type PhotoEffect = 'original' | 'mono' | 'warm';

export interface GuestSnapshot {
  revision: number;
  theme: AppTheme;
  mode: 'assisted' | 'self-service';
  stage: 'idle' | 'design' | 'ready' | 'capture' | 'review' | 'done';
  ready: boolean;
  busy: boolean;
  paused: boolean;
  mirror: boolean;
  effect?: PhotoEffect;
  countdown: number | null;
  // Absolute host deadline. Clients derive digits locally to avoid polling lag.
  countdownEndsAt?: number | null;
  // Added when a snapshot is read, never persisted as part of its revision.
  hostTime?: number;
  current: number;
  total: number;
  message: string;
  error: string;
  frames: { id: string; name: string; preview: string; shots: number }[];
  photos: { id: string; thumbnail: string }[];
  strip: string;
}
export interface GuestCommand {
  revision: number;
  action: 'frame' | 'design' | 'start' | 'continue' | 'retake' | 'confirm' | 'next' | 'effect';
  effect?: PhotoEffect;
  frameId?: string;
  photoIds?: string[];
}
export interface GuestStatus {
  displays: { id: number; label: string; primary: boolean }[];
  displayId: number | null;
  tablet: boolean;
  urls: string[];
  pairingCode: string;
  devices: { id: string; name: string; approved: boolean; connected: boolean }[];
}

// Online gallery contracts. No cloud endpoint or upload implementation exists yet.
export interface SharedGallery {
  id: string;
  title: string;
  expiresAt: string | null;
  photos: { id: string; imageUrl: string; downloadUrl: string }[];
}
