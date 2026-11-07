import { memo } from 'react';
import type { PhotoAreaView, PhotoRecord } from '@vyora/shared';
import { PhotoAreaImage } from './PhotoAreaImage';
import './capture-shot-rail.css';

export const CaptureShotRail = memo(function CaptureShotRail({
  total,
  current,
  photos,
  remaining,
  retaking,
  areas,
}: {
  total: number;
  current: number;
  photos: (PhotoRecord | undefined)[];
  remaining: number;
  retaking: boolean;
  areas?: PhotoAreaView[];
}) {
  return (
    <div className={`capture-shot-rail capture-shots-${total}`}>
      <div className="capture-shot-heading" role="status" aria-live="polite">
        <strong>
          {retaking ? 'Retaking photo' : 'Photo'} {current} of {total}
        </strong>
        <span>
          {remaining} {retaking ? 'retake' : 'photo'}
          {remaining === 1 ? '' : 's'} left
        </span>
      </div>
      <ol
        className={
          total > 4
            ? 'capture-shot-tiles capture-shot-many'
            : 'capture-shot-tiles'
        }
        aria-label="Photo capture order"
      >
        {Array.from({ length: total }, (_, index) => {
          const photo = photos[index];
          const active = index === current - 1;
          const area = areas?.find((item) => item.photoIndex === index) ?? {
            photoIndex: index,
            width: 600,
            height: 394,
          };
          return (
            <li
              key={index}
              style={{ aspectRatio: `${area.width} / ${area.height}` }}
              className={`capture-shot-tile ${photo ? 'is-captured' : ''} ${active ? 'is-current' : ''}`}
              aria-current={active ? 'step' : undefined}
              aria-label={`Photo ${index + 1}: ${active ? (retaking ? 'retaking' : 'current shot') : photo ? 'captured' : 'upcoming'}`}
            >
              {photo?.thumbnail ? (
                <PhotoAreaImage
                  photo={photo}
                  area={area}
                  label={`Photo ${index + 1}, as framed`}
                />
              ) : (
                <span className="capture-shot-placeholder" aria-hidden="true">
                  {index + 1}
                </span>
              )}
              {photo?.thumbnail && (
                <span className="capture-shot-number" aria-hidden="true">
                  {index + 1}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
});
