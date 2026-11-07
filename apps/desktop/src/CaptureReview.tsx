import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoCrop, PhotoEffect, StripRecord } from '@vyora/shared';
import { stripPreviewUrl } from './photo-strip';
import { PhotoEffectPicker } from './PhotoEffectPicker';
import { DEFAULT_PHOTO_CROP, photoAreaViews } from './photo-framing';
import { PhotoAreaImage } from './PhotoAreaImage';
import { PhotoPositioner } from './PhotoPositioner';
import { frameChoiceName } from './frame-choices';
import './capture-review.css';

export function CaptureReview({
  strip,
  total,
  effect,
  exporting,
  onEffectChange,
  onCropChange,
  onContinue,
  timer,
  cameraReady,
  connecting,
  cameraError,
  captureError,
  onClose,
  onRetake,
  onConnect,
  onConfirm,
}: {
  strip: StripRecord;
  total: number;
  effect: PhotoEffect;
  exporting: boolean;
  onEffectChange: (effect: PhotoEffect) => void;
  onCropChange: (areaIndex: number, crop: PhotoCrop) => Promise<void>;
  onContinue: () => void;
  timer: number;
  cameraReady: boolean;
  connecting: boolean;
  cameraError: string;
  captureError: string;
  onClose: () => void;
  onRetake: (photoIds: string[]) => void;
  onConnect: () => Promise<void>;
  onConfirm: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const saving = confirming || exporting;
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ index: number; crop: PhotoCrop } | null>(
    null,
  );
  const areas = photoAreaViews(strip, total);
  const displayedStrip = useMemo(
    () =>
      draft
        ? {
            ...strip,
            photoCrops: photoAreaViews(strip, total).map((area, index) =>
              index === draft.index
                ? draft.crop
                : (area.crop ?? DEFAULT_PHOTO_CROP),
            ),
          }
        : strip,
    [strip, total, draft],
  );
  const preview = useMemo(
    () => stripPreviewUrl(displayedStrip, effect),
    [displayedStrip, effect],
  );
  const remaining = total - strip.photos.length;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function confirm() {
    setConfirming(true);
    setError('');
    try {
      if (!(await onConfirm()))
        setError(
          'Could not save your strip. Your photos are still here; try again.',
        );
    } catch {
      setError(
        'Could not save your strip. Your photos are still here; try again.',
      );
    } finally {
      setConfirming(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="capture-review"
      aria-labelledby="capture-review-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="capture-review-shell">
        <header className="capture-review-header">
          <div>
            <span className="capture-review-kicker">
              A LITTLE MOMENT. MAKE IT YOURS.
            </span>
            <h2 id="capture-review-title">Happy with your photos?</h2>
            <p>
              Adjust your framing, choose a look, or retake photos before
              saving.
            </p>
          </div>
          <button
            type="button"
            className="outline-button"
            disabled={saving}
            onClick={onClose}
          >
            Back to booth
          </button>
        </header>
        {(error || captureError) && (
          <p className="capture-review-error" role="alert">
            {error || captureError}
          </p>
        )}
        <div className="capture-review-body">
          <section
            className="capture-review-preview"
            aria-label="Current strip preview"
          >
            <img
              src={preview}
              alt={`Your current ${strip.photos.length}-photo strip`}
            />
            <span>
              {strip.template
                ? frameChoiceName(strip.template)
                : 'VYORA Doodle'}{' '}
              · {strip.photos.length} photos
            </span>
          </section>
          <section
            className="capture-review-choices"
            aria-label="Choose photos to retake"
          >
            <div className="capture-review-effects">
              <h3>Choose your look</h3>
              <PhotoEffectPicker
                value={effect}
                disabled={saving}
                onChange={onEffectChange}
              />
            </div>
            <div className="capture-review-selection-heading">
              <h3>Keep or retake</h3>
              <button
                type="button"
                className="text-button"
                disabled={saving}
                onClick={() =>
                  setSelected(
                    selected.length
                      ? []
                      : strip.photos.map((photo) => photo.id),
                  )
                }
              >
                {selected.length ? 'Clear selection' : 'Select all'}
              </button>
            </div>
            <div className="capture-review-photo-grid">
              {strip.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  className="capture-review-photo"
                  aria-pressed={selected.includes(photo.id)}
                  disabled={saving}
                  aria-label={`Photo ${index + 1}: ${selected.includes(photo.id) ? 'selected for retake' : 'keep'}`}
                  onClick={() =>
                    setSelected((value) =>
                      value.includes(photo.id)
                        ? value.filter((id) => id !== photo.id)
                        : [...value, photo.id],
                    )
                  }
                >
                  <PhotoAreaImage
                    photo={photo}
                    area={areas.find((area) => area.photoIndex === index)!}
                    effect={effect}
                    label={`Captured photo ${index + 1}, as framed`}
                  />
                  <span>
                    <strong>Photo {index + 1}</strong>
                    <small>
                      {selected.includes(photo.id) ? 'Retake ✓' : 'Keep'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <PhotoPositioner
              areas={areas}
              photos={strip.photos}
              effect={effect}
              disabled={saving}
              onApply={onCropChange}
              onDraftChange={setDraft}
            />
            <p className="capture-review-selection-note" role="status">
              {selected.length
                ? `${selected.length} selected. Only these photos will be replaced, in their original positions.`
                : remaining > 0
                  ? `Take ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} to finish your strip.`
                  : 'Your photos look good? Confirm below to save the strip.'}
            </p>
            {!cameraReady && (
              <div className="capture-review-camera-note" role="status">
                <p>
                  {cameraError ||
                    (remaining > 0
                      ? 'Reconnect the camera to finish taking your photos.'
                      : 'Enable your camera to retake photos. You can still confirm the current strip.')}
                </p>
                <button
                  type="button"
                  className="outline-button"
                  disabled={saving || connecting}
                  onClick={() => void onConnect()}
                >
                  {connecting ? 'Connecting…' : 'Reconnect camera'}
                </button>
              </div>
            )}
            <p className="capture-review-timer">
              {timer}s countdown before each retake. Review again before saving.
            </p>
          </section>
        </div>
        <footer className="capture-review-footer">
          <span>Not saved yet. Keep VYORA open until you confirm.</span>
          <div>
            <button
              type="button"
              className="outline-button"
              disabled={
                !selected.length ||
                !cameraReady ||
                connecting ||
                saving ||
                !!draft
              }
              onClick={() => onRetake(selected)}
            >
              Retake selected{selected.length ? ` (${selected.length})` : ''}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={
                saving ||
                !!draft ||
                !!selected.length ||
                (remaining > 0 && (!cameraReady || connecting))
              }
              title={
                selected.length
                  ? 'Retake or clear your selection before confirming'
                  : undefined
              }
              onClick={remaining > 0 ? onContinue : () => void confirm()}
            >
              {saving
                ? 'Saving strip…'
                : remaining > 0
                  ? 'Take remaining photos'
                  : 'Confirm & save strip'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
