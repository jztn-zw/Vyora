import type { PhotoAreaView, PhotoEffect } from '@vyora/shared';
import { photoPlacement } from './photo-framing';
import { photoEffectFilter } from './photo-effects';

export function PhotoAreaImage({
  photo,
  area,
  effect,
  label,
}: {
  photo: { thumbnail: string; width?: number; height?: number };
  area: PhotoAreaView;
  effect?: PhotoEffect;
  label: string;
}) {
  const fit =
    photo.width && photo.height
      ? photoPlacement(
          photo.width,
          photo.height,
          area.width,
          area.height,
          area.crop,
        )
      : { x: 0, y: 0, width: area.width, height: area.height };
  return (
    <svg
      className="photo-area-image"
      viewBox={`0 0 ${area.width} ${area.height}`}
      style={{ aspectRatio: `${area.width} / ${area.height}` }}
      role="img"
      aria-label={label}
    >
      <image
        href={photo.thumbnail}
        {...fit}
        preserveAspectRatio="xMidYMid slice"
        style={{ filter: photoEffectFilter(effect) }}
      />
    </svg>
  );
}
