import type { PhotoEffect, StripRecord } from '@vyora/shared';
import stripBrand from './strip-brand.json' with { type: 'json' };
import { validateTemplate, photoSlotTransform } from './template-layout.ts';
import { photoEffectFilter } from './photo-effects.ts';

const { symbol: stripSymbol, wordmark: stripWordmark } = stripBrand;

export const STRIP_WIDTH = 720;
const TOP = 64;
const PHOTO_HEIGHT = 394;
const GAP = 36;
const FOOTER = 300;

export function stripHeight(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 4)
    throw new Error('A strip needs 1–4 photos.');
  return TOP + count * PHOTO_HEIGHT + (count - 1) * GAP + FOOTER;
}

function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
}

export function createStripSvg(strip: StripRecord, effect?: PhotoEffect) {
  const filter =
    effect && effect !== 'original'
      ? ` style="filter:${photoEffectFilter(effect)}"`
      : '';
  if (strip.template) {
    const template = validateTemplate(strip.template);
    stripHeight(strip.photos.length);
    if (strip.photos.length > template.slots.length)
      throw new Error('Too many photos for this template.');
    const frame = `<image data-layer="frame" href="${template.frame}" x="0" y="0" width="${template.width}" height="${template.height}"/>`;
    const photos = template.slots
      .map((slot, index) => {
        const photo = strip.photos[index];
        if (
          photo?.thumbnail &&
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            photo.thumbnail,
          )
        )
          throw new Error('The strip contains an invalid photo.');
        const x = slot.x * template.width,
          y = slot.y * template.height;
        const width = slot.width * template.width,
          height = slot.height * template.height;
        return `<g transform="${photoSlotTransform(slot, template.width, template.height)}"><svg data-slot="${index + 1}" x="${x}" y="${y}" width="${width}" height="${height}" overflow="hidden"><rect width="100%" height="100%" fill="white"/>${photo?.thumbnail ? `<image href="${escapeXml(photo.thumbnail)}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"${filter}/>` : ''}</svg></g>`;
      })
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" overflow="hidden" width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}"><title>${escapeXml(template.name)}</title><rect width="100%" height="100%" fill="white"/>${template.layer === 'background' ? frame + photos : photos + frame}</svg>`;
  }
  const height = stripHeight(strip.photos.length);
  const footerY = height - FOOTER;
  const photos = strip.photos
    .map((photo, index) => {
      if (
        photo.thumbnail &&
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
          photo.thumbnail,
        )
      ) {
        throw new Error('The strip contains an invalid photo.');
      }
      const y = TOP + index * (PHOTO_HEIGHT + GAP);
      const side = index % 2 ? 688 : 30;
      return `${photo.thumbnail ? `<image href="${escapeXml(photo.thumbnail)}" x="60" y="${y}" width="600" height="${PHOTO_HEIGHT}" preserveAspectRatio="xMidYMid slice"${filter}/>` : `<rect x="60" y="${y}" width="600" height="${PHOTO_HEIGHT}" fill="white"/>`}
      <g fill="white" font-family="monospace" font-size="16" text-anchor="middle">
        <path d="M${side - 7} ${y + 50}l7-16 7 16z"/><text x="${side}" y="${y + 76}">${String(index + 1).padStart(2, '0')}</text>
        <path d="M${side - 7} ${y + 90}h14l-7 16z"/>
      </g>`;
    })
    .join('');
  const heartY = TOP + PHOTO_HEIGHT + 10;
  const tapeY =
    TOP + Math.min(2, strip.photos.length - 1) * (PHOTO_HEIGHT + GAP);
  const date = new Date(strip.createdAt).toLocaleDateString('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const perforations = Array.from(
    { length: Math.max(1, Math.floor((footerY - 150) / 82)) },
    (_, index) => {
      const y = 145 + index * 82;
      return `<rect x="13" y="${y}" width="8" height="15" rx="2" fill="#474747"/><rect x="699" y="${y}" width="8" height="15" rx="2" fill="#474747"/>`;
    },
  ).join('');
  const frameLines = strip.photos
    .map((_, index) => {
      const y = TOP + index * (PHOTO_HEIGHT + GAP);
      return `<rect x="55" y="${y - 5}" width="610" height="${PHOTO_HEIGHT + 10}" fill="none" stroke="#606060" stroke-width=".8"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_WIDTH}" height="${height}" viewBox="0 0 ${STRIP_WIDTH} ${height}">
    <title>VYORA Photobooth · Doodle No. 01</title>
    <desc>Original VYORA emblem and custom wordmark, black film frame, fine edge details, a hand-drawn heart, layered tape and a paper signature panel.</desc>
    <defs>
      <filter id="brand-mono" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1"/>
        <feComponentTransfer><feFuncA type="linear" slope="1.05" intercept="-.03"/></feComponentTransfer>
        <feComposite in2="SourceAlpha" operator="in"/>
      </filter>
      <filter id="brand-inverse" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -.2126 -.7152 -.0722 0 1"/>
        <feComponentTransfer><feFuncA type="linear" slope="1.05" intercept="-.03"/></feComponentTransfer>
        <feComposite in2="SourceAlpha" operator="in"/>
      </filter>
    </defs>
    <rect width="720" height="${height}" fill="#101010"/>
    <rect x="8" y="8" width="704" height="${height - 16}" fill="none" stroke="#4b4b4b" stroke-width=".75"/>
    ${perforations}
    <g fill="#bbb" font-family="'Segoe UI',sans-serif" font-size="10" letter-spacing="2">
      <text x="62" y="36">PHOTOBOOTH / 01</text>
      <text x="658" y="36" text-anchor="end">DOODLE EDITION</text>
    </g>
    <image data-brand="original-vyora-emblem" href="${stripSymbol}" x="338" y="15" width="44" height="36" filter="url(#brand-inverse)"/>
    ${frameLines}
    ${photos}
    <g fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round">
      <path d="m47 86-12-4m22-11-10-12m24 3-4-14" stroke-width="5"/>
      <path d="m47 86-12-4m22-11-10-12m24 3-4-14" stroke="#101010" stroke-width="1.3"/>
      <circle cx="28" cy="103" r="2" fill="white" stroke="none"/>
    </g>
    ${
      strip.photos.length > 1
        ? `<g transform="translate(608 ${heartY + 2}) rotate(8)">
      <path d="M0 21C-53-20-34-69-3-42 14-67 52-50 33-19 24-5 11 8 0 21Z" fill="white" stroke="#101010" stroke-width="13" stroke-linejoin="round"/>
      <path d="M0 21C-53-20-34-69-3-42 14-67 52-50 33-19 24-5 11 8 0 21Z" fill="white" stroke="white" stroke-width="5" stroke-linejoin="round"/>
      <path d="M0 13C-43-21-29-56-5-32L-1-28 4-35C19-55 43-42 26-19 19-9 9 1 0 13Z" fill="none" stroke="#101010" stroke-width="4.5"/>
      <path d="m-52-42-21-11m17 39-26 4m48 23-15 17m87-74 12-17" fill="none" stroke="#101010" stroke-width="8" stroke-linecap="round"/>
      <path d="m-52-42-21-11m17 39-26 4m48 23-15 17m87-74 12-17" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </g>`
        : ''
    }
    <g transform="translate(6 ${tapeY - 21}) rotate(-11 103 27)">
      <path d="m0 4 12-4 11 5 12-4 12 4 14-4 12 4 14-4 12 4 13-4 12 4 13-3 12 3 14-3 12 4 13-3 11 4 11-2-4 54-12 3-12-4-13 4-12-4-12 4-14-3-13 3-14-3-12 3-13-3-12 3-13-3-12 3-13-3-12 3-12-3Z" fill="#dedede" opacity=".8"/>
      <path d="m10 13 178 2m-180 9 180 1m-178 11 178-2m-176 12 174-2" stroke="white" opacity=".2" stroke-width="2"/>
      <path d="m68 17 47 3-19 9 33 4m-59 8 54-7" fill="none" stroke="#555" opacity=".18" stroke-width="1.5"/>
    </g>
    <g transform="translate(649 ${footerY - 21})" fill="white" stroke="#101010" stroke-width="5">
      <path d="M0-57C5-21 15-7 38 0 15 8 6 22 0 57-6 22-15 8-38 0-15-7-5-21 0-57Z"/>
      <path d="m-46 23 3 13 12 4-12 4-3 13-4-13-12-4 12-4z" stroke-width="2"/>
      <circle cx="20" cy="-48" r="2" stroke="none"/>
    </g>
    <g fill="none" stroke="#6c6c6c" stroke-width=".65">
      <path d="M61 ${footerY + 23}H659M61 ${height - 49}H659"/>
      <path d="M61 ${footerY + 19}v8m598-8v8M61 ${height - 53}v8m598-8v8"/>
    </g>
    <path d="m30 ${footerY + 60} 65-11 86 3 76-7 89 4 89-4 73 5 76-2 55 11-16 14 20 12-14 17 12 14-16 13 12 15-18 12 9 13-52 10-70-4-87 6-87-4-78 3-79-5-74 3-65-9 16-14-17-12 14-13-17-14 16-13-12-13 14-12Z" fill="white"/>
    <g stroke="#101010" stroke-width=".8" opacity=".16">
      <path d="M61 ${footerY + 53}l96 2m-86 5 58-1m434-1 68 2m-40 148 57-3m-553-2 70 2m-50 5 94-1"/>
    </g>
    <image data-brand="original-vyora-emblem" href="${stripSymbol}" x="78" y="${footerY + 65}" width="126" height="104" filter="url(#brand-mono)"/>
    <path d="M225 ${footerY + 68}v99" stroke="#202020" stroke-width="1"/>
    <image data-brand="original-vyora-wordmark" aria-label="VYORA Photobooth" href="${stripWordmark}" x="258" y="${footerY + 68}" width="355" height="102" filter="url(#brand-mono)"/>
    <g fill="#bfbfbf" font-family="'Segoe UI',sans-serif" font-size="11" letter-spacing="2.5">
      <text x="64" y="${height - 66}">A LITTLE MOMENT.</text>
      <text x="656" y="${height - 66}" text-anchor="end">A LASTING FEELING.</text>
    </g>
    <text x="360" y="${height - 24}" text-anchor="middle" fill="#a8a8a8" font-family="monospace" font-size="11" letter-spacing="2">${escapeXml(date.toUpperCase())} / ${String(strip.photos.length).padStart(2, '0')} MOMENT${strip.photos.length === 1 ? '' : 'S'}</text>
  </svg>`;
}

export function stripPreviewUrl(strip: StripRecord, effect?: PhotoEffect) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createStripSvg(strip, effect))}`;
}

export async function renderStripJpeg(
  strip: StripRecord,
  effect?: PhotoEffect,
) {
  const image = new Image();
  // A blob avoids making a second, URL-escaped copy of the SVG and all its
  // full-resolution embedded photos during export.
  const source = URL.createObjectURL(
    new Blob([createStripSvg(strip, effect)], {
      type: 'image/svg+xml;charset=utf-8',
    }),
  );
  const canvas = document.createElement('canvas');
  try {
    image.src = source;
    await image.decode();
    canvas.width = strip.template?.width ?? STRIP_WIDTH;
    canvas.height = strip.template?.height ?? stripHeight(strip.photos.length);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo strip.');
    context.drawImage(image, 0, 0);
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not export the strip.')),
        'image/jpeg',
        0.96,
      ),
    );
    return jpeg.arrayBuffer();
  } finally {
    URL.revokeObjectURL(source);
    image.src = '';
    canvas.width = canvas.height = 0;
  }
}
