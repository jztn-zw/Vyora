import { useEffect, useRef, useState } from 'react';
import type { StripRecord } from '@vyora/shared';
import { stripPreviewUrl } from './photo-strip';
import './strip-viewer.css';
import { StripPrint } from './StripPrint';

export function StripViewer({
  strip,
  pending,
  onClose,
  onSave,
  onRefresh,
  printerRevision,
  onPrinterSettings,
  onPaperLayout,
}: {
  strip: StripRecord;
  pending: boolean;
  onClose: () => void;
  onSave: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
  printerRevision: number;
  onPrinterSettings: () => void;
  onPaperLayout: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState(
    () => strip.preview || stripPreviewUrl(strip),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const checkedLibrary = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        let fullSize: string;
        if (strip.preview) {
          const result = await window.vyora.getStripPreview(strip.id);
          if (!result.ok) throw new Error(result.error);
          fullSize = result.value;
        } else {
          const result = await window.vyora.getStripSources(strip.id);
          if (!result.ok) throw new Error(result.error);
          fullSize = stripPreviewUrl(result.value);
        }
        const image = new Image();
        image.src = fullSize;
        await image.decode();
        if (!cancelled) setSource(fullSize);
      } catch {
        if (!cancelled) {
          setError(
            'Could not open the full-size strip. Its file may have been moved, deleted, or become unreadable.',
          );
          if (!checkedLibrary.current) {
            checkedLibrary.current = true;
            await onRefresh();
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strip, attempt, onRefresh]);

  function close() {
    dialog.current?.close();
    onClose();
  }

  async function save() {
    setActing(true);
    setActionError('');
    try {
      if (!(await onSave()))
        setActionError('Could not save this strip. Please try again.');
    } catch {
      setActionError('Could not save this strip. Please try again.');
    } finally {
      setActing(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="strip-viewer"
      aria-labelledby="strip-viewer-title"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="strip-viewer-shell">
        <header className="strip-viewer-header">
          <h2 id="strip-viewer-title">Your photo strip</h2>
          <button
            className="outline-button"
            type="button"
            onClick={close}
            autoFocus
          >
            Close
          </button>
        </header>
        {error && (
          <div className="strip-viewer-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                checkedLibrary.current = false;
                setAttempt((value) => value + 1);
              }}
            >
              Retry preview
            </button>
          </div>
        )}
        {actionError && (
          <div className="strip-viewer-error" role="alert">
            {actionError}
          </div>
        )}
        <div
          className="strip-viewer-stage"
          role="region"
          aria-label="Photo strip preview"
          aria-busy={loading}
        >
          <img
            src={source}
            alt={`VYORA strip with ${strip.photos.length} photos`}
          />
          {loading && (
            <span className="strip-viewer-loading" role="status">
              Loading photo…
            </span>
          )}
        </div>
        {(pending || !strip.preview) && (
          <footer className="strip-viewer-footer">
            <button
              className="primary-button"
              type="button"
              disabled={acting}
              onClick={() => void save()}
            >
              {acting ? 'Saving…' : pending ? 'Retry save' : 'Save strip'}
            </button>
          </footer>
        )}
        {!pending && !!strip.preview && (
          <footer className="strip-viewer-footer">
            <StripPrint
              stripId={strip.id}
              settingsRevision={printerRevision}
              onSettings={onPrinterSettings}
              onPaperLayout={onPaperLayout}
            />
          </footer>
        )}
      </div>
    </dialog>
  );
}
