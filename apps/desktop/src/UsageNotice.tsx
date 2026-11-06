import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  acceptNotice,
  hasAcceptedNotice,
  NOTICE_REVISION,
  usageNotices,
} from './usage-notice';
import { readTheme } from './theme';
import './usage-notice.css';

function NoticeContent() {
  return (
    <div className="usage-notice-content">
      {usageNotices.map((section, index) => (
        <section key={section.title} aria-labelledby={`usage-section-${index}`}>
          <h2 id={`usage-section-${index}`}>
            <span>0{index + 1}</span>
            {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function NoticeGate({
  children,
  appVersion,
}: {
  children: ReactNode;
  appVersion: string;
}) {
  const [accepted, setAccepted] = useState(() =>
    hasAcceptedNotice({ getItem: (key) => localStorage.getItem(key) }),
  );
  const [checked, setChecked] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = readTheme(
      { getItem: (key) => localStorage.getItem(key) },
      matchMedia('(prefers-color-scheme: dark)').matches,
    );
  }, []);
  if (accepted) return children;
  return (
    <main className="usage-welcome">
      <div className="usage-notice-card">
        <header className="usage-notice-header">
          <span
            className="vyora-wordmark"
            role="img"
            aria-label="VYORA Photobooth"
          />
          <span className="usage-notice-badge">
            TESTING BUILD · v{appVersion}
          </span>
          <h1>Before your first moment.</h1>
          <p>
            Please read the testing terms and privacy notice before using VYORA.
          </p>
          <small>Notice revision: {NOTICE_REVISION}</small>
        </header>
        <NoticeContent />
        <footer className="usage-notice-footer">
          <label className="usage-notice-consent">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>
              I agree to the testing terms and have read the privacy and testing
              notices.
            </span>
          </label>
          {storageError && (
            <p role="status">
              Your choice could not be saved on this computer. Continue for this
              session; this notice will appear again next time.
            </p>
          )}
          <div className="usage-notice-actions">
            <button
              type="button"
              className="outline-button"
              onClick={() => window.close()}
            >
              Decline & exit
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!checked}
              onClick={() => {
                if (!checked) return;
                if (!storageError) {
                  try {
                    acceptNotice(localStorage, appVersion);
                  } catch {
                    setStorageError(true);
                    return;
                  }
                }
                setAccepted(true);
              }}
            >
              {storageError ? 'Continue for this session' : 'Accept & continue'}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

export function UsageNoticeDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="usage-notice-dialog"
      aria-labelledby="usage-notice-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="usage-notice-header">
        <span className="usage-notice-badge">VYORA · TESTING BUILD</span>
        <h1 id="usage-notice-title">Terms & privacy</h1>
        <small>Notice revision: {NOTICE_REVISION}</small>
      </header>
      <NoticeContent />
      <footer className="usage-notice-actions">
        <button
          className="primary-button"
          type="button"
          onClick={onClose}
          autoFocus
        >
          Close
        </button>
      </footer>
    </dialog>
  );
}
