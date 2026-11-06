import { memo } from 'react';
import type { PhotoRecord } from '@vyora/shared';
import './capture-shot-rail.css';

export const CaptureShotRail = memo(function CaptureShotRail({
  total,
  current,
  photos,
  remaining,
  retaking,
}: {
  total: number;
  current: number;
  photos: (PhotoRecord | undefined)[];
  remaining: number;
  retaking: boolean;
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
      <ol className="capture-shot-tiles" aria-label="Photo capture order">
        {Array.from({ length: total }, (_, index) => {
          const photo = photos[index];
          const active = index === current - 1;
          return (
            <li
              key={index}
              className={`capture-shot-tile ${photo ? 'is-captured' : ''} ${active ? 'is-current' : ''}`}
              aria-current={active ? 'step' : undefined}
              aria-label={`Photo ${index + 1}: ${active ? (retaking ? 'retaking' : 'current shot') : photo ? 'captured' : 'upcoming'}`}
            >
              {photo?.thumbnail ? (
                <img src={photo.thumbnail} alt="" />
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
