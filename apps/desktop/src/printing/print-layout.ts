import type { PrinterSettings, CustomPaperProfile } from '@vyora/shared';

export class PrintError extends Error {}
export class PrintUncertainError extends PrintError {}

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
    value.copies! > 10
  )
    throw new PrintError('Choose a printer, a strip layout, and 1–10 sheets.');
  if (value.layout === 'sheet' && value.copies !== 1)
    throw new PrintError(
      'Full-sheet layouts print one physical sheet at a time. Add strip copies to the sheet queue instead.',
    );
  return {
    deviceName: value.deviceName,
    layout: value.layout!,
    copies: value.copies!,
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

export function printGeometry(layout: PrinterSettings['layout']) {
  if (layout !== 'single-strip' && layout !== 'double-strip')
    throw new PrintError('Invalid print layout.');
  const columns = layout === 'double-strip' ? 2 : 1;
  return {
    columns,
    widthMm: 50.8 * columns,
    heightMm: 152.4,
    pageSize: { width: 50800 * columns, height: 152400 },
  };
}

export function printDocument(jpeg: string, settings: PrinterSettings) {
  validatePrinterSettings(settings);
  if (
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(jpeg) ||
    jpeg.length > 28 * 1024 * 1024
  )
    throw new PrintError('The saved strip could not be prepared for printing.');
  const { columns, widthMm, heightMm } = printGeometry(settings.layout);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>VYORA photo strip</title><style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; background: white; }
.sheet { display: flex; width: ${widthMm}mm; height: ${heightMm}mm; break-inside: avoid; }
.strip { width: 50.8mm; height: ${heightMm}mm; flex: none; }
img { display: block; width: 100%; height: 100%; object-fit: contain; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><main class="sheet">${Array.from({ length: columns }, () => `<div class="strip"><img alt="VYORA photo strip" src="${jpeg}"></div>`).join('')}</main></body></html>`;
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
