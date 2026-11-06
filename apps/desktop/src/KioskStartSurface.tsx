import './kiosk-start-surface.css';

export function KioskStartSurface({
  disabled,
  countdown,
  photos,
  onStart,
}: {
  disabled: boolean;
  countdown?: number;
  photos: number;
  onStart: () => void;
}) {
  return (
    <button
      className="kiosk-start-surface"
      type="button"
      disabled={disabled}
      onClick={onStart}
      aria-label="Start your photo session"
    >
      <span className="kiosk-start-hint">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 12V5a2 2 0 0 1 4 0v6l2-1 4 2a2 2 0 0 1 1 2l-1 5a3 3 0 0 1-3 2h-4a3 3 0 0 1-2-1l-5-6a1.5 1.5 0 0 1 2-2l2 2" />
          <path d="M5 5H3M6 2 5 1M17 5h2M16 2l1-1" />
        </svg>
        <strong>Tap anywhere to begin</strong>
        <span>
          {countdown ? `${countdown}-second countdown · ` : 'Get ready for '}
          {photos} photos
        </span>
      </span>
    </button>
  );
}
