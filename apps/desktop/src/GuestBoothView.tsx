import type { GuestCommand, GuestSnapshot, PhotoRecord } from '@vyora/shared';
import { FrameCarousel } from './FrameCarousel';
import { CaptureShotRail } from './CaptureShotRail';
import { CaptureCountdown } from './CaptureCountdown';
import { KioskStartSurface } from './KioskStartSurface';
import { PhotoEffectPicker } from './PhotoEffectPicker';
import { photoEffectFilter } from './photo-effects';

// Reuse the original guest booth's carousel, full-screen camera and completion styles.
export function GuestBoothView({
  state,
  preview,
  canAct,
  selected,
  onSelect,
  onAction,
}: {
  state: GuestSnapshot;
  preview: string;
  canAct: boolean;
  selected: string[];
  onSelect: (id: string) => void;
  onAction: (
    action: GuestCommand['action'],
    extra?: Partial<GuestCommand>,
  ) => void;
}) {
  const assisted = state.mode === 'assisted';
  const remaining = state.total - state.photos.length;
  return (
    <>
      <div className="capture-layout">
        <section className="capture-column">
          <div className="viewfinder guest-camera">
            {preview && state.ready && (
              <img
                className={state.mirror ? 'guest-live mirrored' : 'guest-live'}
                src={preview}
                alt="Live camera preview"
              />
            )}
            {!state.ready && (
              <div className="kiosk-camera-notice">
                <strong>Please wait while we prepare the camera.</strong>
                <p>
                  {state.error || 'Your organizer will help you get ready.'}
                </p>
              </div>
            )}
            {state.stage === 'capture' && (
              <>
                <CaptureShotRail
                  total={state.total}
                  current={state.current}
                  remaining={state.total - state.photos.length}
                  retaking={false}
                  photos={state.photos.map(
                    (photo) =>
                      ({
                        ...photo,
                        width: 0,
                        height: 0,
                        createdAt: '',
                      }) as PhotoRecord,
                  )}
                />
                <CaptureCountdown
                  value={state.countdown}
                  endsAt={state.countdownEndsAt}
                />
              </>
            )}
            {state.stage === 'ready' && state.ready && !assisted && (
              <KioskStartSurface
                disabled={!canAct}
                photos={state.total}
                onStart={() => onAction('start')}
              />
            )}
            {state.stage === 'ready' && state.ready && assisted && (
              <div className="kiosk-ready-prompt" role="status">
                <strong>Get ready for your photos.</strong>
                <span>
                  Look at the camera and strike a pose. Your organizer will
                  start the countdown.
                </span>
              </div>
            )}
            {state.stage === 'capture' && state.countdown == null && (
              <p className="kiosk-shot-progress">
                {state.message ||
                  `Photo ${state.current} of ${state.total} · Strike a pose.`}
              </p>
            )}
          </div>
        </section>
      </div>
      {state.stage === 'ready' && !assisted && (
        <>
          <div className="kiosk-capture-toolbar">
            <button
              className="kiosk-back-button"
              disabled={!canAct}
              onClick={() => onAction('design')}
            >
              Change frame
            </button>
          </div>
        </>
      )}
      {state.stage === 'design' && (
        <section className="kiosk-screen kiosk-design-screen guest-design">
          <div className="kiosk-stage-heading">
            <span className="kiosk-screen-kicker">YOUR PHOTO SESSION</span>
            <h1>Choose your photo frame.</h1>
            <p>
              {assisted
                ? 'Your organizer will select your frame.'
                : 'Select a frame below. You’ll have time to get ready before we take your photos.'}
            </p>
          </div>
          <FrameCarousel>
            {state.frames.map((frame) => (
              <button
                className="kiosk-template-card"
                type="button"
                disabled={!canAct}
                key={frame.id}
                aria-label={`Choose ${frame.name}, ${frame.shots} photos`}
                onClick={() => onAction('frame', { frameId: frame.id })}
              >
                <span className="kiosk-template-preview">
                  <img src={frame.preview} alt={frame.name} />
                </span>
              </button>
            ))}
          </FrameCarousel>
        </section>
      )}
      {state.stage === 'review' && (
        <section
          className="guest-review capture-review-shell"
          aria-label="Review your photos"
        >
          <header className="capture-review-header">
            <div>
              <span className="capture-review-kicker">
                A LITTLE MOMENT. MAKE IT YOURS.
              </span>
              <h2>Happy with your photos?</h2>
              <p>
                {assisted
                  ? 'Tell your organizer if you’d like to retake a photo.'
                  : 'Choose a look for your strip and retake any photos before saving.'}
              </p>
            </div>
          </header>
          {state.error && (
            <p className="capture-review-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="capture-review-body">
            <section className="capture-review-preview guest-strip">
              <img src={state.strip} alt="Your current photo strip" />
            </section>
            <section className="capture-review-choices">
              {!assisted && (
                <div className="capture-review-effects">
                  <h3>Choose your look</h3>
                  <PhotoEffectPicker
                    value={state.effect}
                    disabled={!canAct}
                    onChange={(effect) => {
                      if (effect !== (state.effect ?? 'original'))
                        onAction('effect', { effect });
                    }}
                  />
                </div>
              )}
              <h3>Keep or retake</h3>
              <div className="capture-review-photo-grid guest-retake-grid">
                {state.photos.map((photo, index) => (
                  <button
                    className="capture-review-photo"
                    disabled={!canAct}
                    key={photo.id}
                    aria-pressed={selected.includes(photo.id)}
                    onClick={() => onSelect(photo.id)}
                  >
                    <img
                      src={photo.thumbnail}
                      style={{ filter: photoEffectFilter(state.effect) }}
                      alt={`Photo ${index + 1}`}
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
              <p className="capture-review-selection-note">
                {selected.length
                  ? `${selected.length} selected. Only these photos will be replaced.`
                  : remaining > 0
                    ? `Take ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} to finish your strip.`
                    : assisted
                      ? 'Your organizer will confirm your finished strip.'
                      : 'Your photos look good? Confirm below to save the strip.'}
              </p>
            </section>
          </div>
          {!assisted && (
            <footer className="capture-review-footer guest-buttons">
              <span>Not saved yet. Keep the booth open until you confirm.</span>
              <div>
                <button
                  className="outline-button"
                  disabled={!canAct || !selected.length || !state.ready}
                  onClick={() => onAction('retake', { photoIds: selected })}
                >
                  Retake selected {selected.length || ''}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    !canAct ||
                    !!selected.length ||
                    (remaining > 0 && !state.ready)
                  }
                  onClick={() =>
                    onAction(remaining > 0 ? 'continue' : 'confirm')
                  }
                >
                  {remaining > 0
                    ? 'Take remaining photos'
                    : 'Confirm & save strip'}
                </button>
              </div>
            </footer>
          )}
        </section>
      )}
      {state.stage === 'done' && (
        <section className="kiosk-screen kiosk-done-screen guest-done">
          <div className="kiosk-done-preview">
            <img src={state.strip} alt="Your saved photo strip" />
          </div>
          <div className="kiosk-done-copy">
            <span className="kiosk-success-mark" aria-hidden="true">
              ✓
            </span>
            <span className="kiosk-screen-kicker">A MOMENT TO KEEP</span>
            <h1>Your strip is ready.</h1>
            <p>
              It’s saved on this computer. Thanks for stopping by the booth.
            </p>
            {!assisted && (
              <button
                className="primary-button kiosk-start-button"
                disabled={!canAct}
                onClick={() => onAction('next')}
              >
                Next group →
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
