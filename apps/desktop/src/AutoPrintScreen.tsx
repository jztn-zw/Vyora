import { useState } from 'react';
import type { PrintJob } from '@vyora/shared';
import './auto-print.css';

export function AutoPrintScreen({
  job,
  operator,
  onNext,
  onRetry,
  onSkip,
  onSettings,
  issue,
}: {
  job: PrintJob;
  operator: boolean;
  onNext?: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onSkip?: () => Promise<void>;
  onSettings?: () => void;
  issue?: string;
}) {
  const [working, setWorking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const loading = job.status === 'preparing' || job.status === 'submitting';
  const submitted = job.status === 'submitted';
  async function act(action?: () => Promise<void>) {
    if (!action || working) return;
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Please check the printer and try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <section
      className="auto-print-screen"
      aria-labelledby="auto-print-title"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="auto-print-card">
        <span
          className={`auto-print-mark${loading ? ' is-loading' : ''}`}
          aria-hidden="true"
        >
          {loading ? '' : submitted ? '✓' : '!'}
        </span>
        <span className="kiosk-screen-kicker">YOUR PHOTO IS SAVED</span>
        <h1 id="auto-print-title">
          {loading
            ? 'Sending your print…'
            : submitted
              ? 'Sent to the printer.'
              : 'The printer needs a hand.'}
        </h1>
        <p>
          {loading
            ? 'Please wait while VYORA prepares and sends your photo. The next group can begin after this step.'
            : submitted
              ? 'Collect your photos when printing finishes, then continue to the next group.'
              : operator
                ? job.message
                : 'Your photos are safe. Please ask your organizer to check the printer.'}
        </p>
        <small>{job.printerName}</small>
        {(error || issue) && <p role="alert">{error || issue}</p>}
        {submitted && onNext && (
          <button
            className="primary-button"
            type="button"
            disabled={working}
            onClick={() => void act(onNext)}
          >
            Next group
          </button>
        )}
        {operator && !loading && !submitted && (
          <div className="auto-print-recovery">
            <div>
              <button
                className="outline-button"
                type="button"
                disabled={working}
                onClick={onSettings}
              >
                Printer settings
              </button>
              {job.status === 'failed' && (
                <button
                  className="primary-button"
                  type="button"
                  disabled={working}
                  onClick={() => void act(onRetry)}
                >
                  {working ? 'Checking…' : 'Check & retry print'}
                </button>
              )}
            </div>
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={working}
                onChange={(event) => setChecked(event.target.checked)}
              />{' '}
              I checked the physical print and Windows queue.
            </label>
            <button
              className="text-button"
              type="button"
              disabled={!checked || working}
              onClick={() => void act(onSkip)}
            >
              Continue without another print
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
