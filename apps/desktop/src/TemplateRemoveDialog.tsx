import { useEffect, useRef, useState } from 'react';

export function TemplateRemoveDialog({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="template-remove-dialog"
      aria-labelledby="remove-template-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="remove-template-title">Remove this template?</h2>
      <p>
        “{name}” will be removed from your frame choices. Your saved photo
        strips will stay in your library.
      </p>
      {error && <p role="alert">{error}</p>}
      <div>
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
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onConfirm();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Could not remove this template.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Removing…' : 'Remove template'}
        </button>
      </div>
    </dialog>
  );
}
