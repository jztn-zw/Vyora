import type {
  PhotoAreaView,
  PhotoCrop,
  PhotoFrameRect,
  StripRecord,
} from '@vyora/shared';
import { photoSourceIndex } from './photo-sources.ts';

export const DEFAULT_PHOTO_CROP: PhotoCrop = { x: 0.5, y: 0.5, zoom: 1 };

export function validatePhotoCrop(input: unknown): PhotoCrop {
  const value = input as PhotoCrop | null;
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.zoom) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1 ||
    value.zoom < 1 ||
    value.zoom > 3
  )
    throw new Error(
      'Choose a photo position inside the frame and a zoom from 1 to 3.',
    );
  return { x: value.x, y: value.y, zoom: value.zoom };
}

export function photoAreaViews(
  strip: Pick<StripRecord, 'template' | 'photoCrops'>,
  count = 4,
): PhotoAreaView[] {
  return strip.template
    ? strip.template.slots.map((slot, index) => ({
        photoIndex: photoSourceIndex(slot, index),
        width: slot.width * strip.template!.width,
        height: slot.height * strip.template!.height,
        crop: strip.photoCrops?.[index],
      }))
    : Array.from({ length: count }, (_, index) => ({
        photoIndex: index,
        width: 600,
        height: 394,
        crop: strip.photoCrops?.[index],
      }));
}

// One fit calculation powers the live guide, review, repositioning and export.
export function photoPlacement(
  photoWidth: number,
  photoHeight: number,
  areaWidth: number,
  areaHeight: number,
  crop = DEFAULT_PHOTO_CROP,
) {
  const scale =
    Math.max(areaWidth / photoWidth, areaHeight / photoHeight) * crop.zoom;
  const width = photoWidth * scale;
  const height = photoHeight * scale;
  return {
    x: (areaWidth - width) * crop.x,
    y: (areaHeight - height) * crop.y,
    width,
    height,
  };
}

export function photoVisibleRect(
  photoWidth: number,
  photoHeight: number,
  area: PhotoAreaView,
): PhotoFrameRect {
  const fit = photoPlacement(
    photoWidth,
    photoHeight,
    area.width,
    area.height,
    area.crop,
  );
  return {
    x: Math.max(0, -fit.x / fit.width),
    y: Math.max(0, -fit.y / fit.height),
    width: area.width / fit.width,
    height: area.height / fit.height,
  };
}

// A linked photo may fill several different shapes: keep everyone inside their intersection.
export function captureFrameRect(
  photoWidth: number,
  photoHeight: number,
  areas: PhotoAreaView[],
  photoIndex: number,
): PhotoFrameRect {
  const matches = areas.filter((area) => area.photoIndex === photoIndex);
  const rectangles = (
    matches.length ? matches : [{ photoIndex, width: 600, height: 394 }]
  ).map((area) =>
    photoVisibleRect(photoWidth, photoHeight, { ...area, crop: undefined }),
  );
  const x = Math.max(...rectangles.map((rect) => rect.x));
  const y = Math.max(...rectangles.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.min(...rectangles.map((rect) => rect.x + rect.width)) - x,
    height: Math.min(...rectangles.map((rect) => rect.y + rect.height)) - y,
  };
}
