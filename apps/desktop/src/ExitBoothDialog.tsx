import { useEffect, useRef } from 'react';
import './exit-booth-dialog.css';

export function ExitBoothDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="exit-booth-dialog"
      aria-labelledby="exit-booth-title"
      aria-describedby="exit-booth-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <span className="exit-booth-kicker">GUEST BOOTH</span>
      <h2 id="exit-booth-title">Exit the booth?</h2>
      <p id="exit-booth-description">
        You’ll return to the studio and turn off the camera. Any unsaved photos
        will stay available in VYORA.
      </p>
      <footer>
        <button
          type="button"
          className="outline-button"
          onClick={onClose}
          autoFocus
        >
          Stay in booth
        </button>
        <button type="button" className="primary-button" onClick={onConfirm}>
          Exit booth
        </button>
      </footer>
    </dialog>
  );
}
