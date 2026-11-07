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
            : 'Could not check your printer. Try Refresh.',
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
  return (
    <fieldset className="booth-session-setting auto-print-setting">
      <legend>Auto-print</legend>
      <p>
        Print after photos are confirmed and saved. Keep the booth on the print
        screen before the next group.
      </p>
      <label className="auto-print-toggle">
        <span>
          <strong>Print automatically</strong>
          <small>
            {state?.settings
              ? printer?.displayName || state.settings.deviceName
              : 'Choose a photo printer first'}
          </small>
        </span>
        <span className="mirror-control auto-print-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="Print automatically"
            checked={enabled}
            disabled={busy || state?.busy || (!enabled && !available)}
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
      <p className="auto-print-status" role="status">
        {busy
          ? 'Checking printer…'
          : state?.settings?.layout === 'sheet'
            ? 'Choose Photo printer mode. Full sheets need an operator to arrange and load the paper.'
            : printer?.statusMessage ||
              'Connect your printer, then save it in Printer settings.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="auto-print-setting-actions">
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onPrinterSettings}
        >
          Printer settings
        </button>
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
          Refresh
        </button>
      </div>
    </fieldset>
  );
}
