import type { PhotoEffect } from '@vyora/shared';

// Use identical filters for review thumbnails and the exported strip.
export const photoEffects: {
  id: PhotoEffect;
  label: string;
  filter: string;
}[] = [
  { id: 'original', label: 'Original', filter: 'none' },
  { id: 'mono', label: 'Black & white', filter: 'grayscale(1)' },
  { id: 'warm', label: 'Warm', filter: 'sepia(0.3) saturate(1.15)' },
];

export function isPhotoEffect(value: unknown): value is PhotoEffect {
  return photoEffects.some((effect) => effect.id === value);
}

export function photoEffectFilter(value?: PhotoEffect): string {
  return photoEffects.find((effect) => effect.id === value)?.filter ?? 'none';
}
