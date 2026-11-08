import './live-frame-preview.css';

export function LiveFramePreview({
  source,
  captured,
  total,
}: {
  source: string;
  captured: number;
  total: number;
}) {
  return (
    <aside className="live-frame-preview" aria-label="Live frame preview">
      <header>
        <strong>Your frame</strong>
        <span role="status" aria-atomic="true">
          {captured} of {total} photos
        </span>
      </header>
      <img
        src={source}
        alt="Photo positions and captures in the selected frame"
      />
    </aside>
  );
}
