import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DesktopResult,
  PaperRect,
  PaperSpec,
  PaperState,
  PrinterState,
  StripRecord,
} from '@vyora/shared';
import {
  arrangePaper,
  checkPaperProfile,
  paperPresets,
  queuePhotoSize,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  validatePaperSpec,
} from './printing/paper-layout';
import { formatPrintSize } from './printing/print-layout';
import { stripPreviewUrl } from './photo-strip';
import { PaperMeasure } from './PaperMeasure';
import { StudioSelect } from './StudioSelect';
import './paper-manager.css';

const unresolved = (status: string) =>
  ['reserved', 'sent', 'check'].includes(status);
const inches = (n: number) => Number((n / 25400).toFixed(3));

export function PaperManager({
  strips,
  printerRevision,
  onClose,
  onSettings,
}: {
  strips: StripRecord[];
  printerRevision: number;
  onClose: () => void;
  onSettings: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const alive = useRef(true);
  const acting = useRef(false);
  const hasPending = useRef(false);
  const revision = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const printToken = useRef<string | null>(null);
  const addToken = useRef<string | null>(null);
  const [state, setState] = useState<PaperState | null>(null);
  const [printer, setPrinter] = useState<PrinterState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState<PaperSpec>({
    kind: 'long-bond',
    width: 215900,
    height: 330200,
    margin: 6350,
    gap: 2540,
    guides: true,
  });
  const [marking, setMarking] = useState(false);
  const [mark, setMark] = useState<PaperRect | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (full = true) => {
    const attempt = ++revision.current;
    if (full) setLoading(true);
    try {
      const [papers, devices] = await Promise.all([
        window.vyora.getPaperState(),
        full ? window.vyora.getPrinterState() : window.vyora.getPrintActivity(),
      ]);
      if (!alive.current || attempt !== revision.current) return;
      if (!papers.ok) {
        setError(papers.error);
        return;
      }
      setState(papers.value);
      if (!devices.ok) setError(devices.error);
      else if (full) setPrinter(devices.value as PrinterState);
      else
        setPrinter((current) =>
          current ? { ...current, ...devices.value } : current,
        );
    } catch {
      if (alive.current && attempt === revision.current)
        setError(
          'Could not load the paper layout. Close and reopen VYORA if it was just updated.',
        );
    } finally {
      if (alive.current && attempt === revision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    void refresh();
    const focus = () => {
      if (!acting.current) void refresh();
    };
    let polling = false;
    const timer = setInterval(() => {
      if (!hasPending.current || acting.current || polling) return;
      polling = true;
      void refresh(false).finally(() => {
        polling = false;
      });
    }, 1500);
    window.addEventListener('focus', focus);
    return () => {
      alive.current = false;
      revision.current++;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      dialog.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    void refresh();
  }, [printerRevision, refresh]);
  const queueKey = state?.queue.map((q) => q.id).join(',');
  useEffect(() => {
    addToken.current = null;
  }, [queueKey]);

  async function perform(action: () => Promise<DesktopResult<PaperState>>) {
    if (acting.current) return false;
    acting.current = true;
    revision.current++;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (!alive.current) return false;
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setState(result.value);
      setLoaded(false);
      return true;
    } catch {
      if (alive.current)
        setError(
          'Could not confirm this paper operation. Refresh the layout before trying again.',
        );
      return false;
    } finally {
      acting.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }
  function close() {
    if (acting.current) return;
    dialog.current?.close();
    onClose();
  }

  const paper = state?.papers.find((p) => p.id === state.activePaperId) ?? null;
  const pendingBatch = state?.batches.find((b) => unresolved(b.status)) ?? null;
  hasPending.current = !!pendingBatch;
  const locked = !!paper && pendingBatch?.paperId === paper.id;
  const placements = useMemo(
    () =>
      paper
        ? locked
          ? pendingBatch!.placements
          : arrangePaper(paper, state?.queue ?? [])
        : [],
    [paper, locked, pendingBatch, state?.queue],
  );
  const sources = useMemo(
    () =>
      new Map(
        strips.map((strip) => [
          strip.id,
          strip.preview || stripPreviewUrl(strip),
        ]),
      ),
    [strips],
  );
  const reservedIds = new Set(
    pendingBatch?.placements.map((p) => p.queueId) ?? [],
  );
  let paperProblem = '';
  const configured = printer?.settings?.layout === 'sheet';
  if (paper && printer?.settings) {
    if (paper.deviceName !== printer.settings.deviceName)
      paperProblem =
        'This paper record belongs to another printer. Select its matching printer.';
    else
      try {
        checkPaperProfile(
          paper.spec,
          paper.deviceName,
          printer.settings.customPaperProfile,
        );
      } catch (cause) {
        paperProblem =
          cause instanceof Error ? cause.message : 'Check the paper profile.';
      }
  }
  let specProblem = '';
  try {
    validatePaperSpec(spec);
    if (printer?.settings)
      checkPaperProfile(
        spec,
        printer.settings.deviceName,
        printer.settings.customPaperProfile,
      );
  } catch (cause) {
    specProblem =
      cause instanceof Error ? cause.message : 'Check these measurements.';
  }
  const disabled = busy || loading || !!state?.issue;

  function point(event: React.PointerEvent<SVGSVGElement>, strict = false) {
    const matrix = canvas.current?.getScreenCTM();
    if (!matrix || !paper) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (
      strict &&
      (p.x < 0 || p.y < 0 || p.x > paper.spec.width || p.y > paper.spec.height)
    )
      return null;
    return {
      x: Math.round(Math.max(0, Math.min(paper.spec.width, p.x))),
      y: Math.round(Math.max(0, Math.min(paper.spec.height, p.y))),
    };
  }
  function rectangle(a: { x: number; y: number }, b: { x: number; y: number }) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }
  async function create() {
    if (
      await perform(() =>
        window.vyora.createPrintPaper(
          name.trim() ||
            `${spec.kind === 'custom' ? 'Leftover' : spec.kind === 'long-bond' ? 'Long bond' : spec.kind.toUpperCase()} ${(state?.papers.length ?? 0) + 1}`,
          spec,
        ),
      )
    ) {
      setCreating(false);
      setName('');
      setMarking(false);
    }
  }
  async function print() {
    if (!paper) return;
    const prior = state?.batches.find((b) => b.id === printToken.current);
    if (!printToken.current || (prior && !unresolved(prior.status)))
      printToken.current = crypto.randomUUID();
    await perform(() =>
      window.vyora.printSheet(
        paper.id,
        paper.revision,
        printToken.current!,
        loaded,
      ),
    );
  }

  return (
    <dialog
      ref={dialog}
      className="printer-dialog paper-dialog"
      aria-labelledby="paper-title"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const b = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < b.left ||
          event.clientX > b.right ||
          event.clientY < b.top ||
          event.clientY > b.bottom
        )
          close();
      }}
    >
      <div className="printer-shell paper-shell">
        <header className="printer-header">
          <div>
            <h2 id="paper-title">Paper & layout</h2>
            <p>Arrange photos at their fitted sizes in the remaining space.</p>
          </div>
          <button
            type="button"
            className="outline-button"
            onClick={close}
            disabled={busy}
            autoFocus
          >
            Close
          </button>
        </header>
        <div className="paper-content">
          {(error || state?.issue) && (
            <p className="printer-notice" role="alert">
              {error || state?.issue}
            </p>
          )}
          {!configured && !loading && (
            <div className="printer-notice">
              <p>
                Choose Full sheets and save your printer before arranging paper.
              </p>
              <button
                type="button"
                className="outline-button"
                onClick={onSettings}
              >
                Printer settings
              </button>
            </div>
          )}
          <div className="paper-toolbar">
            <StudioSelect
              label="Physical paper"
              value={paper?.id ?? ''}
              disabled={disabled}
              options={[
                { value: '', label: 'Select the physical sheet you will load' },
                ...(state?.papers.map((p) => ({
                  value: p.id,
                  label: p.name,
                  description: `${inches(p.spec.width)} × ${inches(p.spec.height)} in · ${p.used.length} used areas`,
                })) ?? []),
              ]}
              onChange={(id) => {
                if (id) {
                  setMarking(false);
                  void perform(() => window.vyora.selectPrintPaper(id));
                }
              }}
            />
            <button
              type="button"
              className="outline-button"
              disabled={disabled || !configured}
              onClick={() => setCreating((current) => !current)}
            >
              New / leftover
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError('');
                void refresh();
              }}
            >
              Refresh
            </button>
          </div>
          {(creating || (!paper && configured)) && (
            <section
              className="paper-create"
              aria-label="Create a physical paper record"
            >
              <div className="paper-create-heading">
                <h3>New sheet or rectangular leftover</h3>
                <p>
                  If you cut the paper, measure the remaining piece and create a
                  new record.
                </p>
              </div>
              <div className="paper-dimensions">
                <label className="paper-measure">
                  <span>Paper name</span>
                  <input
                    maxLength={80}
                    value={name}
                    disabled={disabled}
                    placeholder="e.g. Leftover 1"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <StudioSelect
                  label="Paper size"
                  value={spec.kind}
                  disabled={disabled}
                  options={[
                    ...Object.entries(paperPresets).map(([value, p]) => ({
                      value,
                      label: p.label,
                    })),
                    {
                      value: 'custom',
                      label: 'Custom / leftover',
                      description: 'Requires verified printer limits',
                    },
                  ]}
                  onChange={(kind) =>
                    setSpec((current) =>
                      kind === 'custom'
                        ? { ...current, kind }
                        : {
                            ...current,
                            kind: kind as PaperSpec['kind'],
                            ...paperPresets[kind as keyof typeof paperPresets],
                          },
                    )
                  }
                />
              </div>
              {spec.kind === 'custom' && (
                <div className="paper-dimensions">
                  <PaperMeasure
                    label="Actual piece width"
                    value={spec.width}
                    disabled={disabled}
                    onChange={(width) =>
                      setSpec((current) => ({ ...current, width }))
                    }
                  />
                  <PaperMeasure
                    label="Actual piece length"
                    value={spec.height}
                    disabled={disabled}
                    onChange={(height) =>
                      setSpec((current) => ({ ...current, height }))
                    }
                  />
                </div>
              )}
              <div className="paper-dimensions">
                <PaperMeasure
                  label="Margin on each edge"
                  value={spec.margin}
                  disabled={disabled}
                  onChange={(margin) =>
                    setSpec((current) => ({ ...current, margin }))
                  }
                />
                <PaperMeasure
                  label="Gap between strips"
                  value={spec.gap}
                  disabled={disabled}
                  onChange={(gap) =>
                    setSpec((current) => ({ ...current, gap }))
                  }
                />
              </div>
              <label className="paper-check">
                <input
                  type="checkbox"
                  checked={spec.guides}
                  disabled={disabled}
                  onChange={(event) =>
                    setSpec((current) => ({
                      ...current,
                      guides: event.target.checked,
                    }))
                  }
                />
                Print cutting guides outside the strips
              </label>
              {specProblem && (
                <p className="printer-hint" role="status">
                  {specProblem}
                </p>
              )}
              <div className="paper-create-actions">
                <button
                  type="button"
                  className="outline-button"
                  onClick={onSettings}
                >
                  Printer limits
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={disabled || !configured || !!specProblem}
                  onClick={() => void create()}
                >
                  Use this paper
                </button>
              </div>
            </section>
          )}
          <div className="paper-workspace">
            <section
              className="paper-preview-column"
              aria-label="Physical paper preview"
            >
              <div className="paper-preview-heading">
                <strong>{paper?.name ?? 'Your paper preview'}</strong>
                <span>
                  {paper
                    ? `${inches(paper.spec.width)} × ${inches(paper.spec.height)} inches`
                    : 'Choose a sheet to begin'}
                </span>
              </div>
              <div className={`paper-preview ${marking ? 'is-marking' : ''}`}>
                {paper ? (
                  <svg
                    ref={canvas}
                    viewBox={`-3000 -9000 ${paper.spec.width + 6000} ${paper.spec.height + 12000}`}
                    role="img"
                    aria-label={`Paper preview. ${placements.length} strips arranged at 2 by 6 inches. ${paper.used.length} used areas.`}
                    onPointerDown={(event) => {
                      if (!marking || disabled || locked) return;
                      const p = point(event, true);
                      if (p) {
                        drag.current = p;
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }
                    }}
                    onPointerMove={(event) => {
                      if (!drag.current) return;
                      const p = point(event);
                      if (p) setMark(rectangle(drag.current, p));
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      setMark(null);
                    }}
                    onPointerUp={(event) => {
                      const start = drag.current;
                      drag.current = null;
                      setMark(null);
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      const p = point(event);
                      if (!start || !p || !paper || locked) return;
                      const r = rectangle(start, p);
                      if (r.width >= 1000 && r.height >= 1000)
                        void perform(() =>
                          window.vyora.markPrintPaper(
                            paper.id,
                            paper.revision,
                            [...paper.blocked, r],
                          ),
                        );
                    }}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={paper.spec.width}
                      height={paper.spec.height}
                      fill="white"
                      stroke="#b7b0bd"
                      strokeWidth={650}
                    />
                    <text
                      x={paper.spec.width / 2}
                      y={-3000}
                      textAnchor="middle"
                      className="paper-feed-label"
                    >
                      ↑ THIS EDGE ENTERS FIRST
                    </text>
                    <rect
                      x={paper.spec.margin}
                      y={paper.spec.margin}
                      width={paper.spec.width - 2 * paper.spec.margin}
                      height={paper.spec.height - 2 * paper.spec.margin}
                      className="paper-margin-line"
                    />
                    {paper.used.map((r, i) => (
                      <rect
                        key={`used-${i}`}
                        {...r}
                        className="paper-used-area"
                      />
                    ))}
                    {paper.blocked.map((r, i) => (
                      <rect
                        key={`blocked-${i}`}
                        {...r}
                        className="paper-blocked-area"
                      />
                    ))}
                    {placements.map((p, i) => (
                      <g key={p.queueId}>
                        <rect
                          x={p.x}
                          y={p.y}
                          width={p.width}
                          height={p.height}
                          className="paper-strip-slot"
                        />
                        {sources.has(p.stripId) ? (
                          p.rotated ? (
                            <image
                              href={sources.get(p.stripId)}
                              x={-p.height / 2}
                              y={-p.width / 2}
                              width={p.height}
                              height={p.width}
                              transform={`translate(${p.x + p.width / 2} ${p.y + p.height / 2}) rotate(90)`}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          ) : (
                            <image
                              href={sources.get(p.stripId)}
                              x={p.x}
                              y={p.y}
                              width={p.width}
                              height={p.height}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          )
                        ) : (
                          <text
                            x={p.x + p.width / 2}
                            y={p.y + p.height / 2}
                            textAnchor="middle"
                            className="paper-slot-label"
                          >
                            Strip {i + 1}
                          </text>
                        )}
                      </g>
                    ))}
                    {mark && <rect {...mark} className="paper-drag-mark" />}
                  </svg>
                ) : (
                  <p>Select a sheet or create a measured leftover piece.</p>
                )}
              </div>
              <div className="paper-legend">
                <span>
                  <i className="legend-used" />
                  Printed / spoiled
                </span>
                <span>
                  <i className="legend-blocked" />
                  Manually blocked
                </span>
                <span>
                  <i className="legend-queued" />
                  Queued strips
                </span>
              </div>
              {paper && (
                <div className="paper-mark-tools">
                  <button
                    type="button"
                    className="outline-button"
                    aria-pressed={marking}
                    disabled={disabled || locked}
                    onClick={() => {
                      setMarking((value) => !value);
                      setMark(null);
                      drag.current = null;
                    }}
                  >
                    {marking ? 'Finish marking' : 'Mark used space'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled || locked || !paper.blocked.length}
                    onClick={() =>
                      void perform(() =>
                        window.vyora.markPrintPaper(
                          paper.id,
                          paper.revision,
                          paper.blocked.slice(0, -1),
                        ),
                      )
                    }
                  >
                    Undo last manual mark
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={disabled || locked}
                    onClick={() =>
                      void perform(() =>
                        window.vyora.deletePrintPaper(paper.id),
                      )
                    }
                  >
                    Discard record
                  </button>
                </div>
              )}
              {marking && (
                <p className="printer-hint">
                  Drag over areas that already have ink. The same rectangles can
                  be entered below for precise or keyboard-only marking. Manual
                  marks stay on screen only.
                </p>
              )}
              {paper && marking && (
                <AreaEntry
                  disabled={disabled || locked}
                  onAdd={(r) =>
                    void perform(() =>
                      window.vyora.markPrintPaper(paper.id, paper.revision, [
                        ...paper.blocked,
                        r,
                      ]),
                    )
                  }
                />
              )}
              {paperProblem && (
                <p className="printer-notice" role="status">
                  {paperProblem}
                </p>
              )}
            </section>
            <section
              className="paper-queue"
              aria-label="Saved strip print queue"
            >
              <h3>
                Print queue <span>{state?.queue.length ?? 0}</span>
              </h3>
              <p className="printer-hint">
                Different sessions can share one sheet. Nothing prints until you
                choose Print sheet.
              </p>
              <div className="paper-queue-list">
                {state?.queue.length ? (
                  state.queue.map((q, i) => (
                    <article key={q.id}>
                      {sources.has(q.stripId) ? (
                        <img
                          src={sources.get(q.stripId)}
                          alt={`Queued strip ${i + 1}`}
                        />
                      ) : (
                        <span className="paper-queue-placeholder">{i + 1}</span>
                      )}
                      <div>
                        <strong>Strip {i + 1}</strong>
                        <small>
                          {reservedIds.has(q.id)
                            ? 'Reserved for the submitted sheet'
                            : formatPrintSize(queuePhotoSize(q))}
                        </small>
                        <button
                          type="button"
                          className="text-button"
                          disabled={disabled || reservedIds.has(q.id)}
                          onClick={() =>
                            void perform(() =>
                              window.vyora.removeFromPrintSheet(q.id),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <button
                        type="button"
                        className="outline-button"
                        disabled={disabled}
                        aria-label={`Add another copy of strip ${i + 1}`}
                        onClick={() => {
                          if (!addToken.current)
                            addToken.current = crypto.randomUUID();
                          void perform(() =>
                            window.vyora.addToPrintSheet(
                              q.stripId,
                              addToken.current!,
                            ),
                          );
                        }}
                      >
                        +1
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="paper-empty-queue">
                    Open a saved strip and choose Add to sheet.
                  </p>
                )}
              </div>
              {pendingBatch && (
                <div className="paper-result" role="status">
                  <h3>Check the submitted paper</h3>
                  <p>{pendingBatch.message}</p>
                  <p>
                    Choose only after checking the physical sheet and Windows
                    print queue.
                  </p>
                  <div>
                    {(['printed', 'blank', 'spoiled'] as const).map(
                      (result) => (
                        <button
                          key={result}
                          type="button"
                          className="outline-button"
                          disabled={
                            disabled ||
                            pendingBatch.status !== 'check' ||
                            !!printer?.busy
                          }
                          onClick={() =>
                            void perform(() =>
                              window.vyora.resolveSheetPrint(
                                pendingBatch.id,
                                result,
                              ),
                            )
                          }
                        >
                          {result === 'printed'
                            ? 'Printed correctly'
                            : result === 'blank'
                              ? 'Nothing printed'
                              : 'Areas spoiled'}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
        <footer className="printer-footer paper-footer">
          <div>
            <strong>
              {locked
                ? 'Submitted positions are reserved'
                : `${placements.length} queued print${placements.length === 1 ? '' : 's'} on this sheet`}
            </strong>
            <span>
              {paper
                ? `${Math.max(0, (state?.queue.length ?? 0) - placements.length)} remaining in the queue`
                : 'Choose the paper you actually loaded.'}
            </span>
            {paper && (
              <label className="paper-check">
                <input
                  type="checkbox"
                  checked={loaded}
                  disabled={disabled || locked}
                  onChange={(event) => setLoaded(event.target.checked)}
                />
                This exact sheet / piece is loaded with the shown edge first.
              </label>
            )}
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={
              disabled ||
              !configured ||
              !paper ||
              !!paperProblem ||
              !!pendingBatch ||
              !!printer?.busy ||
              !loaded ||
              !placements.length
            }
            onClick={() => void print()}
          >
            {busy ? 'Working…' : 'Print sheet'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function AreaEntry({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (r: PaperRect) => void;
}) {
  const [area, setArea] = useState<PaperRect>({
    x: 0,
    y: 0,
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
  });
  return (
    <div className="paper-area-entry">
      <div className="paper-dimensions">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <PaperMeasure
            key={key}
            label={
              {
                x: 'From left edge',
                y: 'From top edge',
                width: 'Used width',
                height: 'Used length',
              }[key]
            }
            value={area[key]}
            disabled={disabled}
            onChange={(value) =>
              setArea((current) => ({ ...current, [key]: value }))
            }
          />
        ))}
      </div>
      <button
        type="button"
        className="outline-button"
        disabled={
          disabled ||
          !Object.values(area).every(Number.isFinite) ||
          area.width <= 0 ||
          area.height <= 0
        }
        onClick={() => onAdd(area)}
      >
        Add used area
      </button>
    </div>
  );
}
