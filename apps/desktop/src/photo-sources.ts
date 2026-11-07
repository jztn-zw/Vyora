import type { PhotoSlot } from '@vyora/shared';

export const MAX_PHOTO_AREAS = 15;

export function photoSourceIndex(slot: PhotoSlot, areaIndex: number) {
  return slot.photoIndex ?? areaIndex;
}

export function capturePhotoCount(template?: { slots: PhotoSlot[] }) {
  if (!template) return 4;
  return Math.max(-1, ...template.slots.map(photoSourceIndex)) + 1;
}

// Remove unused capture numbers after deleting or linking areas.
export function normalizePhotoSources(slots: PhotoSlot[]): PhotoSlot[] {
  const sources = [...new Set(slots.map(photoSourceIndex))].sort(
    (a, b) => a - b,
  );
  return slots.map((slot, index) => ({
    ...slot,
    photoIndex: sources.indexOf(photoSourceIndex(slot, index)),
  }));
}
