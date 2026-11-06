import { useEffect, useRef } from 'react';
import './guest-controls.css';

export function GuestDisplayIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  );
}
function ActionIcon({ kind }: { kind: 'camera' | 'pause' | 'play' | 'next' }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'camera' ? (
        <>
          <path d="M8 6l2-3h4l2 3h4v14H4V6z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : kind === 'pause' ? (
        <>
          <path d="M8 5v14M16 5v14" />
        </>
      ) : kind === 'play' ? (
        <path d="M8 4l11 8-11 8z" />
      ) : (
        <path d="M4 12h15m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}
export function GuestBoothControls({
  active,
  connected,
  paused,
  running,
  done,
  saving,
  canSetup,
  status,
  onDisplays,
  onSetup,
  onPause,
  onNext,
}: {
  active: boolean;
  connected: boolean;
  paused: boolean;
  running: boolean;
  done: boolean;
  saving: boolean;
  canSetup: boolean;
  status: string;
  onDisplays: () => void;
  onSetup: () => void;
  onPause: () => void;
  onNext: () => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function choose(action: () => void) {
    if (root.current) {
      root.current.open = false;
      root.current
        .querySelector<HTMLElement>('summary')
        ?.focus({ preventScroll: true });
    }
    action();
  }
  return (
    <details
      className="guest-actions"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && root.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          root.current.open = false;
          root.current.querySelector<HTMLElement>('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label={`Guest booth${connected ? ', guest screen connected' : ''}`}
      >
        <GuestDisplayIcon size={16} />
        <span>Guest booth</span>
        {active && (
          <i
            className={`guest-actions-dot${connected ? ' is-connected' : ''}`}
            aria-label={connected ? 'Connected' : 'Waiting for connection'}
          />
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div
        className="guest-actions-menu"
        role="group"
        aria-label="Guest booth actions"
      >
        <div className="guest-actions-heading">
          <span>Guest booth</span>
          <small>
            {connected
              ? 'Screen connected'
              : active
                ? 'Waiting for connection'
                : 'Ready to set up'}
          </small>
        </div>
        <button
          className="guest-action-setup"
          type="button"
          disabled={!canSetup}
          onClick={() => choose(onSetup)}
        >
          <ActionIcon kind="camera" />
          <span>
            <strong>Run guest booth</strong>
            <small>Choose frames and start the full-screen booth</small>
          </span>
        </button>
        <button
          className="guest-action-displays"
          type="button"
          onClick={() => choose(onDisplays)}
        >
          <GuestDisplayIcon />
          <span>
            <strong>Display settings</strong>
            <small>Connect a monitor or pair a guest device</small>
          </span>
        </button>
        {active && (
          <>
            <div className="guest-actions-divider" />
            <p className="guest-actions-session" role="status">
              <strong>Operator assisted</strong>
              {status}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => choose(onPause)}
            >
              <ActionIcon kind={paused ? 'play' : 'pause'} />
              <span>
                <strong>
                  {paused
                    ? 'Resume booth'
                    : running
                      ? 'Stop & pause'
                      : 'Pause booth'}
                </strong>
                <small>
                  {running
                    ? 'Keep captured photos and pause the countdown'
                    : paused
                      ? 'Let your guests continue'
                      : 'Pause new guest actions'}
                </small>
              </span>
            </button>
            {done && (
              <button
                type="button"
                disabled={saving}
                onClick={() => choose(onNext)}
              >
                <ActionIcon kind="next" />
                <span>
                  <strong>Next group</strong>
                  <small>Prepare the next photo session</small>
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
