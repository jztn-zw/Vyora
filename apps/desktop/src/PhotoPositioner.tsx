import { useRef, useState } from 'react';
import type { PhotoAreaView, PhotoCrop, PhotoEffect } from '@vyora/shared';
import { DEFAULT_PHOTO_CROP, photoPlacement } from './photo-framing';
import { PhotoAreaImage } from './PhotoAreaImage';
import './photo-positioner.css';

export function PhotoPositioner({
  areas,
  photos,
  effect,
  disabled,
  onApply,
  onDraftChange,
  onEditingChange,
}: {
  areas: PhotoAreaView[];
  photos: { thumbnail: string; width?: number; height?: number }[];
  effect?: PhotoEffect;
  disabled: boolean;
  onApply: (areaIndex: number, crop: PhotoCrop) => Promise<void>;
  onDraftChange?: (draft: { index: number; crop: PhotoCrop } | null) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>(DEFAULT_PHOTO_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    crop: PhotoCrop;
  } | null>(null);
  const index = active ?? 0;
  const area = areas[index];
  const photo = area && photos[area.photoIndex];
  function update(value: PhotoCrop) {
    setCrop(value);
    onDraftChange?.({ index, crop: value });
  }
  function choose(value: number) {
    setActive(value);
    setError('');
    const next = areas[value].crop ?? DEFAULT_PHOTO_CROP;
    setCrop(next);
    onDraftChange?.({ index: value, crop: next });
    onEditingChange?.(true);
  }
  function close() {
    setActive(null);
    setError('');
    onDraftChange?.(null);
    onEditingChange?.(false);
  }
  if (!area || !photo) return null;
  return (
    <div className="photo-positioner">
      {active === null ? (
        <button
          type="button"
          className="outline-button"
          disabled={disabled}
          onClick={() =>
            choose(areas.findIndex((item) => !!photos[item.photoIndex]))
          }
        >
          Adjust framing
        </button>
      ) : (
        <>
          <div className="photo-positioner-heading">
            <h3>Adjust framing</h3>
            <button
              type="button"
              className="text-button"
              disabled={busy || disabled}
              onClick={close}
            >
              Cancel
            </button>
          </div>
          <label>
            Photo area
            <select
              aria-label="Photo area to adjust"
              value={index}
              disabled={busy || disabled}
              onChange={(event) => choose(Number(event.target.value))}
            >
              {areas.map(
                (item, i) =>
                  photos[item.photoIndex] && (
                    <option key={i} value={i}>
                      Area {i + 1} · Photo {item.photoIndex + 1}
                    </option>
                  ),
              )}
            </select>
          </label>
          <div
            className="photo-positioner-canvas"
            tabIndex={busy || disabled ? -1 : 0}
            role="group"
            aria-label="Photo position. Drag to move or use arrow keys."
            style={{
              aspectRatio: `${area.width} / ${area.height}`,
              width: `min(100%, ${(260 * area.width) / area.height}px)`,
            }}
            onPointerDown={(event) => {
              if (busy || disabled || event.button !== 0 || drag.current)
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                crop,
              };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (
                !start ||
                start.pointer !== event.pointerId ||
                busy ||
                disabled
              )
                return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const fit = photoPlacement(
                photo.width || 4,
                photo.height || 3,
                bounds.width,
                bounds.height,
                start.crop,
              );
              const overflowX = fit.width - bounds.width;
              const overflowY = fit.height - bounds.height;
              update({
                ...start.crop,
                x:
                  overflowX > 0.01
                    ? Math.max(
                        0,
                        Math.min(
                          1,
                          start.crop.x - (event.clientX - start.x) / overflowX,
                        ),
                      )
                    : 0.5,
                y:
                  overflowY > 0.01
                    ? Math.max(
                        0,
                        Math.min(
                          1,
                          start.crop.y - (event.clientY - start.y) / overflowY,
                        ),
                      )
                    : 0.5,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              if (
                busy ||
                disabled ||
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const step = event.shiftKey ? 0.1 : 0.02;
              update({
                ...crop,
                x: Math.max(
                  0,
                  Math.min(
                    1,
                    crop.x +
                      (event.key === 'ArrowLeft'
                        ? step
                        : event.key === 'ArrowRight'
                          ? -step
                          : 0),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    1,
                    crop.y +
                      (event.key === 'ArrowUp'
                        ? step
                        : event.key === 'ArrowDown'
                          ? -step
                          : 0),
                  ),
                ),
              });
            }}
          >
            <PhotoAreaImage
              photo={photo}
              area={{ ...area, crop }}
              effect={effect}
              label={`Area ${index + 1}, photo ${area.photoIndex + 1}`}
            />
            <span className="photo-positioner-grid" aria-hidden="true" />
          </div>
          <p>
            Drag to reposition. Each area can use a different crop of the same
            photo.
          </p>
          <label className="photo-positioner-zoom">
            Zoom <output>{crop.zoom.toFixed(2)}×</output>
            <input
              type="range"
              aria-label="Photo zoom"
              min="1"
              max="3"
              step="0.01"
              value={crop.zoom}
              disabled={busy || disabled}
              onChange={(event) =>
                update({ ...crop, zoom: Number(event.target.value) })
              }
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="photo-positioner-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy || disabled}
              onClick={() => update(DEFAULT_PHOTO_CROP)}
            >
              Reset position
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || disabled}
              onClick={async () => {
                const previous = area.crop ?? DEFAULT_PHOTO_CROP;
                if (
                  crop.x === previous.x &&
                  crop.y === previous.y &&
                  crop.zoom === previous.zoom
                ) {
                  close();
                  return;
                }
                setBusy(true);
                setError('');
                try {
                  await onApply(index, crop);
                  close();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Could not apply this position. Try again.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Applying…' : 'Apply position'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
