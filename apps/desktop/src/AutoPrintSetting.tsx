import { useEffect, useState } from 'react';
import type { PrinterState } from '@vyora/shared';
import './auto-print.css';

export function AutoPrintSetting({
  revision,
  onPrinterSettings,
}: {
  revision: number;
  onPrinterSettings: () => void;
}) {
  const [state, setState] = useState<PrinterState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await window.vyora.getPrinterState().catch(() => null);
      if (!active) return;
      if (result?.ok) {
        setState(result.value);
        setError('');
      } else
        setError(
          result && !result.ok
            ? result.error
            : 'Could not check your printer. Select Refresh status to try again.',
        );
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [revision]);
  const enabled = !!state?.settings?.autoPrint;
  const printer = state?.devices.find(
    (device) => device.name === state.settings?.deviceName,
  );
  const available =
    !!state?.settings &&
    state.settings.layout !== 'sheet' &&
    printer?.readiness === 'ready' &&
    !printer.virtual;
  const printerName = printer?.displayName || state?.settings?.deviceName;
  const needsPrinter = !!state && (!state.settings || printer?.virtual);
  const checking = busy || (!state && !error);
  let unavailableMessage = '';
  if (state && !available) {
    if (printer?.virtual)
      unavailableMessage = `${printerName} can’t print physical strips. Select a physical printer in Photo printer mode.`;
    else if (!state.settings)
      unavailableMessage =
        'Connect a physical printer and save it in Photo printer mode.';
    else if (state.settings.layout === 'sheet')
      unavailableMessage =
        'Switch to Photo printer mode to print automatically.';
    else if (!printer)
      unavailableMessage = `${printerName} isn’t detected. Check its power and connection, then refresh.`;
    else
      unavailableMessage =
        printer.statusMessage || 'Check your printer, then refresh its status.';
  }
  return (
    <fieldset className="booth-session-setting auto-print-setting">
      <legend>Auto-print</legend>
      <p>Print a strip after guests confirm and save it.</p>
      {(available || enabled) && (
        <label className="auto-print-toggle">
          <span>
            <strong>Print automatically</strong>
            <small id="auto-print-printer">Printer: {printerName}</small>
          </span>
          <span className="mirror-control auto-print-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Print automatically"
              aria-describedby="auto-print-printer"
              checked={enabled}
              disabled={busy || state?.busy}
              onChange={async (event) => {
                const value = event.target.checked;
                setBusy(true);
                setError('');
                try {
                  const result = await window.vyora.setAutoPrint(value);
                  if (!result.ok) throw new Error(result.error);
                  setState(result.value);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Could not update auto-print.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span className="switch-track" aria-hidden="true" />
          </span>
        </label>
      )}
      {(checking || unavailableMessage || state?.busy) && (
        <div className="auto-print-status" role="status">
          {checking ? (
            'Checking printer…'
          ) : unavailableMessage ? (
            <>
              <strong>
                {needsPrinter
                  ? 'Photo printer required'
                  : 'Printer needs attention'}
              </strong>
              {unavailableMessage}
            </>
          ) : (
            'Wait for the current printer operation to finish.'
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="auto-print-setting-actions">
        <button
          className={needsPrinter ? 'outline-button' : 'text-button'}
          type="button"
          disabled={busy}
          onClick={onPrinterSettings}
        >
          {needsPrinter ? 'Choose printer' : 'Printer settings'}
        </button>
        {(!needsPrinter || error) && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await window.vyora.getPrinterState();
                if (result.ok) {
                  setState(result.value);
                  setError('');
                } else setError(result.error);
              } catch {
                setError('Could not check your printer. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Refresh status
          </button>
        )}
      </div>
    </fieldset>
  );
}
