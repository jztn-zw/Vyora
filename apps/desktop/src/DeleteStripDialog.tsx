import { useEffect, useRef, useState } from 'react';
import type { StripRecord } from '@vyora/shared';
import './delete-strip.css';

export function DeleteStripDialog({
  strip,
  onClose,
  onDeleted,
}: {
  strip: StripRecord;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await window.vyora.deleteStrip(strip.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDeleted(strip.id);
    } catch {
      setError(
        'Could not confirm deletion. Refresh your library before trying again. Restart VYORA if it was just updated.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="delete-strip-dialog"
      aria-labelledby="delete-strip-title"
      aria-describedby="delete-strip-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!inFlight.current) onClose();
      }}
    >
      <h2 id="delete-strip-title">Delete this strip?</h2>
      <div className="delete-strip-summary">
        <img
          src={strip.preview}
          alt={`${strip.photos.length}-photo strip to delete`}
        />
        <div>
          <strong>{strip.photos.length} photos</strong>
          <span>{new Date(strip.createdAt).toLocaleString()}</span>
          <p id="delete-strip-description">
            The saved image will move to the Recycle Bin. You can restore it
            from Windows.
          </p>
        </div>
      </div>
      {error && (
        <p className="delete-strip-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button
          type="button"
          className="outline-button"
          disabled={busy}
          onClick={onClose}
          autoFocus
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? 'Deleting…' : 'Delete strip'}
        </button>
      </footer>
    </dialog>
  );
}
