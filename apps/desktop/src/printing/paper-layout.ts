import type {
  PaperRect,
  PaperSpec,
  PaperRecord,
  SheetQueueItem,
  SheetPlacement,
  CustomPaperProfile,
} from '@vyora/shared';
import { PrintError, validateCustomProfile } from './print-layout.ts';

export const STRIP_WIDTH = 50800;
export const STRIP_HEIGHT = 152400;
export const paperPresets = {
  'long-bond': {
    width: 215900,
    height: 330200,
    label: 'Long bond · 8.5 × 13 in',
  },
  a4: { width: 210000, height: 297000, label: 'A4 · 210 × 297 mm' },
  letter: { width: 215900, height: 279400, label: 'Letter · 8.5 × 11 in' },
};
export function validUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function validatePaperSpec(input: unknown): PaperSpec {
  const p = input as PaperSpec | null;
  if (
    !p ||
    !['long-bond', 'a4', 'letter', 'custom'].includes(p.kind) ||
    ![p.width, p.height].every(
      (n) => Number.isInteger(n) && n >= 1000 && n <= 1000000,
    ) ||
    !Number.isInteger(p.margin) ||
    p.margin < 0 ||
    p.margin > 30000 ||
    !Number.isInteger(p.gap) ||
    p.gap < 0 ||
    p.gap > 20000 ||
    typeof p.guides !== 'boolean' ||
    p.width <= p.margin * 2 ||
    p.height <= p.margin * 2
  )
    throw new PrintError(
      'Enter valid paper dimensions, margins, and cutting gaps.',
    );
  if (p.kind !== 'custom') {
    const preset = paperPresets[p.kind];
    if (p.width !== preset.width || p.height !== preset.height)
      throw new PrintError(
        'Paper dimensions do not match the selected preset.',
      );
  }
  if (p.guides && (p.margin < 2000 || p.gap < 2000))
    throw new PrintError(
      'Cutting guides require at least 2 mm of margin and gap.',
    );
  return {
    kind: p.kind,
    width: p.width,
    height: p.height,
    margin: p.margin,
    gap: p.gap,
    guides: p.guides,
  };
}
export function checkPaperProfile(
  spec: PaperSpec,
  deviceName: string,
  profile?: CustomPaperProfile,
) {
  validatePaperSpec(spec);
  if (spec.kind !== 'custom') return;
  if (!profile || profile.deviceName !== deviceName || !profile.verified)
    throw new PrintError(
      'Set and verify custom paper limits for this printer in Printer settings before using leftover pieces.',
    );
  validateCustomProfile(profile, deviceName);
  if (
    spec.width < profile.minWidth ||
    spec.height < profile.minHeight ||
    spec.width > profile.maxWidth ||
    spec.height > profile.maxHeight
  )
    throw new PrintError(
      'This piece is outside the printer’s configured paper-size limits. Check its size and feed direction.',
    );
}
export function validateAreas(input: unknown, spec: PaperSpec): PaperRect[] {
  if (!Array.isArray(input) || input.length > 100)
    throw new PrintError('Too many marked paper areas.');
  return input.map((r: PaperRect) => {
    if (
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isInteger) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width < 1 ||
      r.height < 1 ||
      r.x + r.width > spec.width ||
      r.y + r.height > spec.height
    )
      throw new PrintError('Marked areas must stay inside the physical paper.');
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}
function overlaps(a: PaperRect, b: PaperRect, gap: number) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
function pack(
  paper: PaperRecord,
  items: SheetQueueItem[],
  preferredRotation: boolean,
  mixed = false,
) {
  const s = paper.spec;
  const occupied = [...paper.used, ...paper.blocked];
  const placements: SheetPlacement[] = [];
  // Candidate edges avoid a pixel-sized scan and accommodate marked rectangles.
  for (const item of items.slice(0, 16)) {
    const xs = [
      ...new Set([s.margin, ...occupied.map((r) => r.x + r.width + s.gap)]),
    ].sort((a, b) => a - b);
    const ys = [
      ...new Set([s.margin, ...occupied.map((r) => r.y + r.height + s.gap)]),
    ].sort((a, b) => a - b);
    let placed = false;
    for (const y of ys) {
      for (const x of xs) {
        for (const rotated of mixed
          ? [preferredRotation, !preferredRotation]
          : [preferredRotation]) {
          const width = rotated ? STRIP_HEIGHT : STRIP_WIDTH;
          const height = rotated ? STRIP_WIDTH : STRIP_HEIGHT;
          const rect = { x, y, width, height };
          if (
            x < s.margin ||
            y < s.margin ||
            x + width > s.width - s.margin ||
            y + height > s.height - s.margin ||
            occupied.some((r) => overlaps(rect, r, s.gap))
          )
            continue;
          placements.push({
            ...rect,
            queueId: item.id,
            stripId: item.stripId,
            rotated,
          });
          occupied.push(rect);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) break;
  }
  return placements;
}
export function arrangePaper(
  paper: PaperRecord,
  items: SheetQueueItem[],
): SheetPlacement[] {
  validatePaperSpec(paper.spec);
  validateAreas(paper.used, paper.spec);
  validateAreas(paper.blocked, paper.spec);
  const bounded = items.slice(0, Math.max(0, 100 - paper.used.length));
  const options = [
    pack(paper, bounded, false),
    pack(paper, bounded, true),
    pack(paper, bounded, false, true),
    pack(paper, bounded, true, true),
  ];
  return options.reduce((best, option) =>
    option.length > best.length ? option : best,
  );
}
export function validatePlacements(
  paper: PaperRecord,
  placements: SheetPlacement[],
) {
  const s = validatePaperSpec(paper.spec);
  if (!placements.length || placements.length > 16)
    throw new PrintError('Choose between 1 and 16 strips for a sheet.');
  const occupied = [
    ...validateAreas(paper.used, s),
    ...validateAreas(paper.blocked, s),
  ];
  const ids = new Set<string>();
  for (const p of placements) {
    validateAreas([p], s);
    if (
      !validUuid(p.queueId) ||
      !validUuid(p.stripId) ||
      ids.has(p.queueId) ||
      typeof p.rotated !== 'boolean' ||
      p.width !== (p.rotated ? STRIP_HEIGHT : STRIP_WIDTH) ||
      p.height !== (p.rotated ? STRIP_WIDTH : STRIP_HEIGHT) ||
      p.x < s.margin ||
      p.y < s.margin ||
      p.x + p.width > s.width - s.margin ||
      p.y + p.height > s.height - s.margin ||
      occupied.some((r) => overlaps(p, r, s.gap))
    )
      throw new PrintError(
        'A strip overlaps another area or does not fit at 2 × 6 inches.',
      );
    ids.add(p.queueId);
    occupied.push(p);
  }
}
export function sheetDocument(
  paper: PaperRecord,
  placements: SheetPlacement[],
  images: Map<string, string>,
) {
  validatePlacements(paper, placements);
  let bytes = 0;
  for (const source of images.values()) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(source))
      throw new PrintError('Invalid saved strip image.');
    bytes += source.length;
  }
  if (bytes > 40 * 1024 * 1024)
    throw new PrintError(
      'These images are too large for one print sheet. Print fewer strips at a time.',
    );
  const mm = (n: number) => n / 1000;
  const seen = new Map<string, string>();
  const content = placements
    .map((p, i) => {
      const source = images.get(p.stripId);
      if (!source) throw new PrintError('A queued strip image is missing.');
      const previous = seen.get(p.stripId);
      const imageId = `paper-image-${i}`;
      seen.set(p.stripId, previous || imageId);
      const img = `<img alt="VYORA photo strip" ${previous ? `data-copy-of="${previous}"` : `id="${imageId}" src="${source}"`} class="${p.rotated ? 'rotated' : ''}">`;
      return `<div class="strip" style="left:${mm(p.x)}mm;top:${mm(p.y)}mm;width:${mm(p.width)}mm;height:${mm(p.height)}mm">${img}${paper.spec.guides ? '<i class="cut"></i>' : ''}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>VYORA print sheet</title><style>
@page{size:${mm(paper.spec.width)}mm ${mm(paper.spec.height)}mm;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;width:${mm(paper.spec.width)}mm;height:${mm(paper.spec.height)}mm;overflow:hidden;background:white}
.sheet{position:relative;width:100%;height:100%;break-inside:avoid}.strip{position:absolute}img{display:block;width:100%;height:100%;object-fit:contain}img.rotated{position:absolute;width:50.8mm;height:152.4mm;left:50%;top:50%;transform:translate(-50%,-50%) rotate(90deg)}
.cut{position:absolute;inset:-0.7mm;border:0.15mm dashed #777;pointer-events:none}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main class="sheet">${content}</main></body></html>`;
}
