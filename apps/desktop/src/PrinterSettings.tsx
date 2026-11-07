import { NumberInput } from './NumberInput';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrinterSettings as Settings, PrinterState } from '@vyora/shared';
import { StudioSelect } from './StudioSelect';
import './printer.css';
import { PaperMeasure } from './PaperMeasure';

export function PrinterSettings({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialized = useRef(false);
  const request = useRef(0);
  const saving = useRef(false);
  const alive = useRef(true);
  const [state, setState] = useState<PrinterState | null>(null);
  const [draft, setDraft] = useState<Settings>({
    deviceName: '',
    layout: 'double-strip',
    copies: 1,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const attempt = ++request.current;
    setLoading(true);
    setError('');
    try {
      const result = await window.vyora.getPrinterState();
      if (!alive.current || attempt !== request.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.value);
      if (!initialized.current) {
        if (result.value.settings) setDraft(result.value.settings);
        initialized.current = true;
      }
    } catch {
      if (alive.current && attempt === request.current)
        setError(
          'Could not detect printers. Close and reopen VYORA, then try again.',
        );
    } finally {
      if (alive.current && attempt === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    void refresh();
    const focus = () => {
      if (!saving.current) void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      alive.current = false;
      request.current++;
      window.removeEventListener('focus', focus);
      dialog.current?.close();
    };
  }, [refresh]);

  function close() {
    if (saving.current) return;
    dialog.current?.close();
    onClose();
  }

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await window.vyora.savePrinterSettings(draft);
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.value);
      saving.current = false;
      close();
    } catch {
      if (alive.current)
        setError(
          'Could not save printer settings. Close and reopen VYORA, then try again.',
        );
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const detected = state?.devices.some(
    (device) => device.name === draft.deviceName,
  );
  const options = [
    {
      value: '',
      label: 'Choose a printer',
      description: 'Detected from Windows',
    },
    ...(draft.deviceName && !detected
      ? [
          {
            value: draft.deviceName,
            label: draft.deviceName,
            description: 'Not detected · reconnect or choose another',
          },
        ]
      : []),
    ...(state?.devices.map((device) => ({
      value: device.name,
      label: device.displayName,
    })) ?? []),
  ];
  return (
    <dialog
      ref={dialog}
      className="printer-dialog"
      aria-labelledby="printer-title"
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
      <div className="printer-shell">
        <header className="printer-header">
          <div>
            <h2 id="printer-title">Printer settings</h2>
            <p>Your strips, ready to hold.</p>
          </div>
          <button
            className="outline-button"
            type="button"
            onClick={close}
            disabled={busy}
            autoFocus
          >
            Close
          </button>
        </header>
        <div className="printer-content" aria-busy={loading || busy}>
          {error && (
            <p className="printer-notice" role="alert">
              {error}
            </p>
          )}
          {state?.settingsIssue && (
            <p className="printer-notice" role="status">
              {state.settingsIssue}
            </p>
          )}
          {state?.busy && (
            <p className="printer-notice" role="status">
              A print job is still active. Refresh after it finishes to change
              settings.
            </p>
          )}
          <div className="printer-field-heading">
            <h3>Printer</h3>
            <button
              type="button"
              className="text-button"
              disabled={loading || busy}
              onClick={() => void refresh()}
            >
              {loading ? 'Detecting…' : 'Refresh'}
            </button>
          </div>
          <StudioSelect
            label="Printer"
            value={draft.deviceName}
            options={options}
            disabled={loading || busy || state?.busy}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                deviceName: value,
                customPaperProfile: undefined,
              }))
            }
          />
          {!loading && state?.devices.length === 0 && (
            <p className="printer-hint">
              No printers detected. Install your printer in Windows Settings,
              then select Refresh.
            </p>
          )}
          <div
            className="segmented printer-mode"
            role="group"
            aria-label="Printing mode"
          >
            <button
              type="button"
              disabled={busy || state?.busy}
              aria-pressed={draft.layout !== 'sheet'}
              className={draft.layout !== 'sheet' ? 'selected' : ''}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  layout: 'double-strip',
                  copies: 1,
                }))
              }
            >
              Photo printer
            </button>
            <button
              type="button"
              disabled={busy || state?.busy}
              aria-pressed={draft.layout === 'sheet'}
              className={draft.layout === 'sheet' ? 'selected' : ''}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  layout: 'sheet',
                  copies: 1,
                }))
              }
            >
              Full sheets
            </button>
          </div>
          {draft.layout === 'sheet' && (
            <p className="printer-calibration">
              Arrange photos of different sizes on long bond, A4, Letter, or a
              supported leftover piece. Add photos from saved sessions to the
              queue, then cut the finished sheet by hand.
            </p>
          )}
          {draft.layout !== 'sheet' && (
            <>
              <fieldset
                className="printer-layouts"
                disabled={busy || state?.busy}
              >
                <legend>Paper layout</legend>
                {(['double-strip', 'single-strip'] as const).map((layout) => (
                  <button
                    type="button"
                    key={layout}
                    aria-pressed={draft.layout === layout}
                    onClick={() =>
                      setDraft((current) => ({ ...current, layout }))
                    }
                  >
                    <span
                      className={`printer-paper ${layout}`}
                      aria-hidden="true"
                    >
                      <i />
                      <i />
                    </span>
                    <strong>
                      {layout === 'double-strip' ? 'Auto fit' : 'Narrow paper'}
                    </strong>
                    <span>
                      {layout === 'double-strip'
                        ? '4 × 6-inch sheet'
                        : '2 × 6-inch paper'}
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="printer-quantity">
                <label htmlFor="printer-sheets">Sheets per print</label>
                <NumberInput
                  stepLabel="Sheets per print"
                  id="printer-sheets"
                  min="1"
                  max="10"
                  step="1"
                  value={Number.isNaN(draft.copies) ? '' : draft.copies}
                  disabled={busy || state?.busy}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      copies: event.target.valueAsNumber,
                    }))
                  }
                />
              </div>
              <p className="printer-hint">
                {draft.layout === 'double-strip'
                  ? 'Each sheet holds two copies of a narrow strip or one copy of a wider photo.'
                  : 'Each sheet holds one copy fitted to the 2 × 6-inch paper.'}
              </p>
            </>
          )}
          {draft.layout === 'sheet' && (
            <details className="paper-profile">
              <summary>Custom paper and leftover support</summary>
              <p className="printer-hint">
                Use the minimum and maximum sizes from this printer’s manual or
                Windows driver. Unsupported or undersized pieces cannot be
                printed. The width is the edge across the paper feeder.
              </p>
              <label className="paper-check">
                <input
                  type="checkbox"
                  disabled={busy || state?.busy || !draft.deviceName}
                  checked={!!draft.customPaperProfile}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      customPaperProfile: event.target.checked
                        ? {
                            deviceName: current.deviceName,
                            minWidth: 0,
                            minHeight: 0,
                            maxWidth: 0,
                            maxHeight: 0,
                            verified: true,
                          }
                        : undefined,
                    }))
                  }
                />
                I checked that this printer supports these custom paper limits.
              </label>
              {draft.customPaperProfile && (
                <div className="paper-dimensions">
                  {(
                    ['minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const
                  ).map((key) => (
                    <PaperMeasure
                      key={key}
                      label={
                        {
                          minWidth: 'Minimum width',
                          minHeight: 'Minimum length',
                          maxWidth: 'Maximum width',
                          maxHeight: 'Maximum length',
                        }[key]
                      }
                      value={draft.customPaperProfile![key]}
                      disabled={busy || state?.busy}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          customPaperProfile: {
                            ...current.customPaperProfile!,
                            [key]: value,
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </details>
          )}
          <p className="printer-calibration">
            Match the paper size in your printer driver and run one test print
            to check alignment. Borderless printing and automatic cutting depend
            on your printer.
          </p>
        </div>
        <footer className="printer-footer">
          <button
            type="button"
            className="primary-button"
            disabled={
              loading ||
              busy ||
              !!state?.busy ||
              !detected ||
              !Number.isInteger(draft.copies) ||
              draft.copies < 1 ||
              draft.copies > 10
            }
            onClick={() => void save()}
          >
            {busy
              ? 'Saving…'
              : draft.layout === 'sheet'
                ? 'Save & arrange paper'
                : 'Save settings'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
