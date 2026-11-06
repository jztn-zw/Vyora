import type { PhotoSlot, StripTemplateDraft } from '@vyora/shared';

export type PhotoAreaHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function normalizePhotoRotation(degrees: number) {
  return Math.round((((((degrees + 180) % 360) + 360) % 360) - 180) * 10) / 10;
}
export function photoSlotTransform(
  slot: PhotoSlot,
  width: number,
  height: number,
) {
  return `rotate(${slot.rotation ?? 0} ${(slot.x + slot.width / 2) * width} ${(slot.y + slot.height / 2) * height})`;
}

export function pointerRotationDelta(previous: number, next: number) {
  return (
    (Math.atan2(Math.sin(next - previous), Math.cos(next - previous)) * 180) /
    Math.PI
  );
}

export function rotatePhotoSlotInPlace(
  slot: PhotoSlot,
  degrees: number,
): PhotoSlot {
  if (!Number.isFinite(degrees)) return { ...slot };
  return { ...slot, rotation: normalizePhotoRotation(degrees) };
}
export function clampPhotoSlotPosition(slot: PhotoSlot): PhotoSlot {
  return {
    ...slot,
    x: clamp(slot.x, 0, 1 - slot.width),
    y: clamp(slot.y, 0, 1 - slot.height),
  };
}
export function fitRotatedPhotoSlot(
  slot: PhotoSlot,
  width: number,
  height: number,
): PhotoSlot | null {
  const angle = ((slot.rotation ?? 0) * Math.PI) / 180;
  const spanX =
    Math.abs(slot.width * width * Math.cos(angle)) +
    Math.abs(slot.height * height * Math.sin(angle));
  const spanY =
    Math.abs(slot.width * width * Math.sin(angle)) +
    Math.abs(slot.height * height * Math.cos(angle));
  if (spanX > width + 0.000001 || spanY > height + 0.000001) return null;
  const halfX = Math.max(slot.width / 2, spanX / width / 2);
  const halfY = Math.max(slot.height / 2, spanY / height / 2);
  return {
    ...slot,
    x: clamp(slot.x + slot.width / 2, halfX, 1 - halfX) - slot.width / 2,
    y: clamp(slot.y + slot.height / 2, halfY, 1 - halfY) - slot.height / 2,
  };
}

export function adjustPhotoSlot(
  slot: PhotoSlot,
  handle: PhotoAreaHandle | 'move',
  dx: number,
  dy: number,
  aspect = 1,
): PhotoSlot {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ...slot };
  if (handle === 'move')
    return {
      ...slot,
      x: clamp(slot.x + dx, 0, 1 - slot.width),
      y: clamp(slot.y + dy, 0, 1 - slot.height),
    };
  const angle = ((slot.rotation ?? 0) * Math.PI) / 180;
  const localX =
    (dx * aspect * Math.cos(angle) + dy * Math.sin(angle)) / aspect;
  const localY = -dx * aspect * Math.sin(angle) + dy * Math.cos(angle);
  dx = localX;
  dy = localY;
  let left = slot.x,
    top = slot.y,
    right = slot.x + slot.width,
    bottom = slot.y + slot.height;
  // Keep the opposite edge fixed, even if the pointer crosses it.
  if (handle.includes('w')) left = clamp(left + dx, 0, right - 0.02);
  if (handle.includes('e')) right = clamp(right + dx, left + 0.02, 1);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 0.02);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + 0.02, 1);
  const cx = (left + right - 2 * slot.x - slot.width) / 2;
  const cy = (top + bottom - 2 * slot.y - slot.height) / 2;
  return {
    ...slot,
    x: left + cx * (Math.cos(angle) - 1) - (cy * Math.sin(angle)) / aspect,
    y: top + cx * aspect * Math.sin(angle) + cy * (Math.cos(angle) - 1),
    width: Math.max(0.02, right - left),
    height: Math.max(0.02, bottom - top),
  };
}

export function centerPhotoSlots(
  slots: PhotoSlot[],
  selected?: number,
): PhotoSlot[] {
  return slots.map((slot, index) =>
    selected === undefined || selected === index
      ? { ...slot, x: (1 - slot.width) / 2 }
      : { ...slot },
  );
}

export function matchPhotoAreaSize(
  area: PhotoSlot,
  source: PhotoSlot,
): PhotoSlot {
  return {
    ...area,
    width: source.width,
    height: source.height,
    ...(source.rotation !== undefined
      ? { rotation: source.rotation }
      : area.rotation !== undefined
        ? { rotation: 0 }
        : {}),
    x: clamp(area.x, 0, 1 - source.width),
    y: clamp(area.y, 0, 1 - source.height),
  };
}

export function pastePhotoArea(
  slots: PhotoSlot[],
  source: PhotoSlot,
): PhotoSlot[] | null {
  if (slots.length >= 4) return null;
  // Keep the copied size, offset it for visibility, and stay inside the frame.
  const candidates = [0.025, 0.05, 0.075, -0.025, -0.05, -0.075].map(
    (offset) => ({
      ...source,
      x: clamp(source.x + offset, 0, 1 - source.width),
      y: clamp(source.y + offset, 0, 1 - source.height),
    }),
  );
  const pasted =
    candidates.find(
      (area) =>
        !slots.some(
          (slot) =>
            Math.abs(slot.x - area.x) < 0.000001 &&
            Math.abs(slot.y - area.y) < 0.000001 &&
            slot.width === area.width &&
            slot.height === area.height,
        ),
    ) ?? candidates[0];
  return [...slots, pasted];
}

export function validateTemplate(input: unknown): StripTemplateDraft {
  if (!input || typeof input !== 'object')
    throw new Error('Choose a PNG or JPEG frame first.');
  const value = input as StripTemplateDraft;
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.trim().length > 64
  )
    throw new Error('Give the template a name of 1–64 characters.');
  if (
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 128 ||
    value.height < 128 ||
    value.width > 4096 ||
    value.height > 4096 ||
    value.width * value.height > 16000000
  )
    throw new Error(
      'Use an image between 128 and 4096 pixels per side, up to 16 megapixels.',
    );
  if (
    typeof value.frame !== 'string' ||
    value.frame.length > 14000000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.frame)
  )
    throw new Error('The frame must be an embedded PNG image.');
  if (value.layer !== 'overlay' && value.layer !== 'background')
    throw new Error('Choose how the frame is layered.');
  if (
    !Array.isArray(value.slots) ||
    value.slots.length < 2 ||
    value.slots.length > 4
  )
    throw new Error('Mark 2, 3, or 4 photo areas before saving.');
  const slots = value.slots.map((slot) => {
    if (
      !slot ||
      ![slot.x, slot.y, slot.width, slot.height].every(Number.isFinite) ||
      slot.x < 0 ||
      slot.y < 0 ||
      slot.width < 0.02 ||
      slot.height < 0.02 ||
      slot.x + slot.width > 1.000001 ||
      slot.y + slot.height > 1.000001
    )
      throw new Error(
        'Keep each photo area inside the frame, at least 2% wide and tall.',
      );
    if (
      slot.rotation !== undefined &&
      (!Number.isFinite(slot.rotation) ||
        slot.rotation < -180 ||
        slot.rotation > 180)
    )
      throw new Error('Photo area rotation must be between −180° and 180°.');
    return {
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      ...(slot.rotation === undefined ? {} : { rotation: slot.rotation }),
    };
  });
  return {
    name: value.name.trim(),
    width: value.width,
    height: value.height,
    frame: value.frame,
    layer: value.layer,
    slots,
  };
}

export function validateFourPhotoTemplate(input: unknown): StripTemplateDraft {
  const template = validateTemplate(input);
  if (template.slots.length !== 4)
    throw new Error('Mark exactly 4 photo areas before saving.');
  return template;
}

export function evenlySpacedSlots(count: number): PhotoSlot[] {
  const gap = 0.025;
  const top = 0.04;
  const height = (0.82 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: 0.08,
    y: top + index * (height + gap),
    width: 0.84,
    height,
  }));
}

export function resizePhotoAreaCount(
  slots: PhotoSlot[],
  count: number,
  imported: PhotoSlot[] = [],
): PhotoSlot[] {
  if (!Number.isInteger(count) || count < 0 || count > 4)
    throw new Error('Choose 0–4 photo areas.');
  if (!count) return [];
  const starter = evenlySpacedSlots(count);
  return Array.from({ length: count }, (_, index) => ({
    ...(slots[index] ?? imported[index] ?? starter[index]),
  }));
}

// Detect only large enclosed rectangular regions; never treat an image border
// or every transparent decoration as a photograph. The editor remains the fallback.
export function detectPhotoSlots(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (
    pixels.length !== width * height * 4 ||
    width < 1 ||
    height < 1 ||
    width * height > 4000000
  )
    throw new Error('Invalid detection image.');
  function regions(kind: 'transparent' | 'white'): PhotoSlot[] {
    const seen = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const found: PhotoSlot[] = [];
    const matches = (index: number) => {
      const i = index * 4;
      return kind === 'transparent'
        ? pixels[i + 3] < 24
        : pixels[i + 3] > 230 &&
            pixels[i] > 242 &&
            pixels[i + 1] > 242 &&
            pixels[i + 2] > 242;
    };
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || !matches(start)) continue;
      let head = 0,
        tail = 1,
        area = 0;
      let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0,
        border = false;
      queue[0] = start;
      seen[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width,
          y = Math.floor(index / width);
        area++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (!x || !y || x === width - 1 || y === height - 1) border = true;
        const visit = (next: number) => {
          if (!seen[next] && matches(next)) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        };
        if (x) visit(index - 1);
        if (x < width - 1) visit(index + 1);
        if (y) visit(index - width);
        if (y < height - 1) visit(index + width);
      }
      const w = maxX - minX + 1,
        h = maxY - minY + 1;
      if (
        !border &&
        w >= width * 0.1 &&
        h >= height * 0.04 &&
        area >= width * height * 0.015 &&
        area / (w * h) >= 0.88
      )
        found.push({
          x: minX / width,
          y: minY / height,
          width: w / width,
          height: h / height,
        });
    }
    return found.sort((a, b) =>
      Math.abs(a.y - b.y) < 0.025 ? a.x - b.x : a.y - b.y,
    );
  }
  const transparent = regions('transparent');
  if (transparent.length >= 2 && transparent.length <= 4)
    return { slots: transparent, layer: 'overlay' as const, detected: true };
  const white = regions('white');
  if (white.length >= 2 && white.length <= 4)
    return { slots: white, layer: 'background' as const, detected: true };
  return {
    slots: [] as PhotoSlot[],
    layer: 'background' as const,
    detected: false,
  };
}
