import type { StripRecord } from '@vyora/shared';

export interface CaptureTarget {
  index: number;
  photoId?: string;
}

export function retakeTargets(
  strip: StripRecord,
  photoIds: string[],
): CaptureTarget[] {
  if (
    !photoIds.length ||
    new Set(photoIds).size !== photoIds.length ||
    photoIds.some((id) => !strip.photos.some((photo) => photo.id === id))
  )
    throw new Error(
      'Choose the photos from this session that you want to retake.',
    );
  return strip.photos.flatMap((photo, index) =>
    photoIds.includes(photo.id) ? [{ index, photoId: photo.id }] : [],
  );
}
