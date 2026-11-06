import { useEffect, useRef, useState } from 'react';
import type { PrinterState } from '@vyora/shared';
import './printer.css';

export function StripPrint({
  stripId,
  settingsRevision,
  onSettings,
  onPaperLayout,
}: {
  stripId: string;
  settingsRevision: number;
  onSettings: () => void;
  onPaperLayout: () => void;
}) {
  const [state, setState] = useState<PrinterState | null>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [sending, setSending] = useState(false);
  const [added, setAdded] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    setError('');
    setAdded(false);
    requestId.current = null;
    void Promise.resolve()
      .then(() => window.vyora.getPrinterState())
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setState(result.value);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Could not load printers. Restart VYORA if it was just updated.',
          );
      });
    let polling = false;
    const interval = setInterval(() => {
      if (polling) return;
      polling = true;
      void Promise.resolve()
        .then(() => window.vyora.getPrintActivity())
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setStatusError('');
            setState((current) =>
              current ? { ...current, ...result.value } : current,
            );
          } else setStatusError(result.error);
        })
        .catch(() => {
          if (!cancelled)
            setStatusError(
              'Could not confirm print status. Check the Windows print queue before printing again.',
            );
        })
        .finally(() => {
          polling = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      alive.current = false;
      clearInterval(interval);
    };
  }, [settingsRevision]);

  async function print() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      // Retain the token until a terminal result has appeared in the UI. An
      // interrupted IPC reply or a double click must not create a new job.
      if (state?.settings?.layout === 'sheet') {
        if (!requestId.current || added) {
          requestId.current = crypto.randomUUID();
          setAdded(false);
        }
        const result = await window.vyora.addToPrintSheet(
          stripId,
          requestId.current,
        );
        if (!alive.current) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAdded(true);
        return;
      }
      if (
        !requestId.current ||
        (ownJob?.id === requestId.current &&
          ['submitted', 'failed'].includes(ownJob.status))
      )
        requestId.current = crypto.randomUUID();
      const result = await window.vyora.printStrip(stripId, requestId.current);
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState((current) =>
        current
          ? {
              ...current,
              busy: ['preparing', 'submitting', 'uncertain'].includes(
                result.value.status,
              ),
              job: result.value,
            }
          : current,
      );
    } catch {
      if (alive.current)
        setError(
          'Could not confirm this print request. Check the Windows print queue before trying again.',
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setSending(false);
    }
  }

  const configured = !!state?.settings;
  const detected =
    configured &&
    state!.devices.some(
      (device) => device.name === state!.settings!.deviceName,
    );
  const ownJob = state?.job?.stripId === stripId ? state.job : null;
  const uncertain = state?.job?.status === 'uncertain';
  const message =
    error ||
    statusError ||
    (added &&
      'Added to the print sheet queue. Open Paper & layout to arrange and print.') ||
    (uncertain && state?.job?.message) ||
    (ownJob && ownJob.message) ||
    (state?.busy
      ? 'Another print job is active.'
      : !state
        ? 'Loading printer…'
        : configured
          ? !detected
            ? 'Saved printer not detected.'
            : ''
          : 'Choose a printer to print this strip.');
  return (
    <div className="strip-print">
      {message && (
        <p role={error || ownJob?.status === 'failed' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      <div className="strip-print-actions">
        {state?.settings?.layout === 'sheet' && (
          <button
            type="button"
            className="outline-button"
            onClick={onPaperLayout}
          >
            Paper & layout
          </button>
        )}
        {(!configured || !detected || !!error || !!statusError) && (
          <button type="button" className="outline-button" onClick={onSettings}>
            Printer settings
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={
            sending ||
            (state?.settings?.layout === 'sheet'
              ? !configured
              : !detected || !!state?.busy || uncertain || !!statusError)
          }
          onClick={() => void print()}
        >
          {state?.settings?.layout === 'sheet'
            ? sending
              ? 'Adding…'
              : added
                ? 'Add another copy'
                : 'Add to sheet'
            : uncertain
              ? 'Check print queue'
              : sending || (state?.busy && ownJob)
                ? 'Sending…'
                : ownJob?.status === 'submitted'
                  ? 'Print another'
                  : 'Print strip'}
        </button>
      </div>
    </div>
  );
}
