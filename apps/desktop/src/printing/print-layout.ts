import type { PrinterSettings, CustomPaperProfile } from '@vyora/shared';

export class PrintError extends Error {}
export class PrintUncertainError extends PrintError {}

export type ImageSize = { width: number; height: number };
export const STRIP_WIDTH = 50800;
export const STRIP_HEIGHT = 152400;

function isNarrowStrip({ width, height }: ImageSize) {
  return width / height <= 0.4;
}

function fitSize(image: ImageSize, box: ImageSize): ImageSize {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

export function formatPrintSize({ width, height }: ImageSize) {
  return `${Number((width / 25400).toFixed(2))} × ${Number((height / 25400).toFixed(2))} in`;
}

export function sheetPhotoSize(image: ImageSize) {
  return printGeometry('double-strip', image).photoSize;
}

export function validateCustomProfile(
  input: unknown,
  deviceName: string,
): CustomPaperProfile {
  const p = input as CustomPaperProfile | null;
  if (
    !p ||
    p.deviceName !== deviceName ||
    p.verified !== true ||
    ![p.minWidth, p.minHeight, p.maxWidth, p.maxHeight].every(
      (n) => Number.isInteger(n) && n >= 1000 && n <= 5000000,
    ) ||
    p.maxWidth < p.minWidth ||
    p.maxHeight < p.minHeight
  )
    throw new PrintError(
      'Enter this printer’s supported minimum and maximum paper dimensions and verify them against its manual or driver.',
    );
  return {
    deviceName,
    minWidth: p.minWidth,
    minHeight: p.minHeight,
    maxWidth: p.maxWidth,
    maxHeight: p.maxHeight,
    verified: true,
  };
}

export function validatePrinterSettings(input: unknown): PrinterSettings {
  const value = input as Partial<PrinterSettings> | null;
  if (
    !value ||
    typeof value.deviceName !== 'string' ||
    !value.deviceName.trim() ||
    value.deviceName.length > 512 ||
    Array.from(value.deviceName).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !['single-strip', 'double-strip', 'sheet'].includes(value.layout || '') ||
    !Number.isInteger(value.copies) ||
    value.copies! < 1 ||
    value.copies! > 10 ||
    (value.autoPrint !== undefined && typeof value.autoPrint !== 'boolean')
  )
    throw new PrintError('Choose a printer, a strip layout, and 1–10 sheets.');
  if (value.layout === 'sheet' && value.copies !== 1)
    throw new PrintError(
      'Full-sheet layouts print one physical sheet at a time. Add strip copies to the sheet queue instead.',
    );
  if (value.autoPrint && value.layout === 'sheet')
    throw new PrintError(
      'Auto-print needs Photo printer mode. Full sheets require an operator to arrange and load the paper.',
    );
  return {
    deviceName: value.deviceName,
    layout: value.layout!,
    copies: value.copies!,
    ...(value.autoPrint ? { autoPrint: true } : {}),
    ...(value.customPaperProfile === undefined
      ? {}
      : {
          customPaperProfile: validateCustomProfile(
            value.customPaperProfile,
            value.deviceName,
          ),
        }),
  };
}

export function printGeometry(
  layout: PrinterSettings['layout'],
  image?: ImageSize,
) {
  if (layout !== 'single-strip' && layout !== 'double-strip')
    throw new PrintError('Invalid print layout.');
  const fullPhoto = layout === 'double-strip' && image && !isNarrowStrip(image);
  const columns = layout === 'double-strip' && !fullPhoto ? 2 : 1;
  const width = layout === 'double-strip' ? 2 * STRIP_WIDTH : STRIP_WIDTH;
  const rotated = !!fullPhoto && image.width > image.height;
  const slotWidth = width / columns;
  const box = rotated
    ? { width: STRIP_HEIGHT, height: slotWidth }
    : { width: slotWidth, height: STRIP_HEIGHT };
  return {
    columns,
    widthMm: width / 1000,
    heightMm: STRIP_HEIGHT / 1000,
    pageSize: { width, height: STRIP_HEIGHT },
    slotWidth,
    rotated,
    photoSize: image ? fitSize(image, box) : box,
  };
}

export function printDocument(
  jpeg: string,
  settings: PrinterSettings,
  image?: ImageSize,
) {
  validatePrinterSettings(settings);
  if (
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(jpeg) ||
    jpeg.length > 28 * 1024 * 1024
  )
    throw new PrintError('The saved strip could not be prepared for printing.');
  const { columns, widthMm, heightMm, slotWidth, rotated } = printGeometry(
    settings.layout,
    image,
  );
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>VYORA photo strip</title><style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; background: white; }
.sheet { display: flex; width: ${widthMm}mm; height: ${heightMm}mm; break-inside: avoid; }
.strip { position: relative; width: ${slotWidth / 1000}mm; height: ${heightMm}mm; flex: none; }
img { display: block; width: 100%; height: 100%; object-fit: contain; }
img.rotated { position: absolute; width: ${heightMm}mm; height: ${slotWidth / 1000}mm; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(90deg); }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><main class="sheet">${Array.from({ length: columns }, () => `<div class="strip"><img${rotated ? ' class="rotated"' : ''} alt="VYORA photo" src="${jpeg}"></div>`).join('')}</main></body></html>`;
}

export function validatePrintRequest(input: unknown) {
  const value = input as { id?: unknown; requestId?: unknown } | null;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.requestId !== 'string' ||
    !uuid.test(value.id) ||
    !uuid.test(value.requestId)
  )
    throw new PrintError('Invalid print request.');
  return { id: value.id, requestId: value.requestId };
}
