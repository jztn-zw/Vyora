import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GuestCommand, GuestSnapshot } from '@vyora/shared';
import { GuestBoothView } from './GuestBoothView';
import { localCountdownDeadline } from './countdown-timing';
import './style.css';
import './kiosk-mode.css';
import './capture-review.css';
import './theme.css';
import '@vyora/shared/brand.css';
import './guest-display.css';
import './controls.css';
import './inputs.css';

const desktop = location.protocol === 'file:' || !!window.vyora?.guestRead;
async function request(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(body ? 100000 : 8000),
    cache: 'no-store',
  });
  if (response.status === 304) return undefined;
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'The laptop is not available.');
  return data;
}
function GuestScreen() {
  const [state, setState] = useState<GuestSnapshot | null>(null);
  const current = useRef<GuestSnapshot | null>(null);
  const [issue, setIssue] = useState('');
  const [actionIssue, setActionIssue] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [code, setCode] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('pair') || '',
  );
  const [name, setName] = useState('Guest device');
  const [pairing, setPairing] = useState(false);
  const [paired, setPaired] = useState(desktop);
  const [fullscreenIssue, setFullscreenIssue] = useState('');
  const lock = useRef(false);
  const revision = useRef(-1);
  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const sentAt = Date.now();
        const result = desktop ? await window.vyora.guestRead() : null;
        if (result && !result.ok) throw new Error(result.error);
        const next: GuestSnapshot | null | undefined = result?.ok
          ? result.value
          : await request(`/api/state?since=${revision.current}`);
        const receivedAt = Date.now();
        if (stopped) return;
        setPaired(true);
        setIssue('');
        if (next === null) {
          current.current = null;
          revision.current = -1;
          setState(null);
          setIssue(
            'Waiting for the organizer’s controller. Your session will resume when it reconnects.',
          );
        }
        if (next && next.revision !== revision.current) {
          const synced = {
            ...next,
            countdownEndsAt: localCountdownDeadline(
              next.countdownEndsAt,
              next.hostTime,
              sentAt,
              receivedAt,
            ),
          };
          revision.current = next.revision;
          current.current = synced;
          setState(synced);
          document.documentElement.dataset.theme = next.theme;
        }
      } catch (error) {
        if (!stopped) {
          current.current = null;
          revision.current = -1;
          setState(null);
          setIssue(
            error instanceof Error
              ? error.message
              : 'Connection lost. Reconnecting to the laptop…',
          );
        }
      }
      if (!stopped)
        timeout = setTimeout(
          () => void poll(),
          current.current?.stage === 'capture' || desktop ? 150 : 350,
        );
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    if (!paired) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    let previous = '';
    const poll = async () => {
      try {
        if (desktop) {
          const result = await window.vyora.guestReadPreview();
          if (result.ok && !stopped) setPreview(result.value);
        } else {
          const response = await fetch('/api/preview', {
            signal: AbortSignal.timeout(5000),
            cache: 'no-store',
          });
          if (response.ok) {
            const blob = await response.blob();
            if (!stopped && blob.size) {
              const url = URL.createObjectURL(blob);
              setPreview(url);
              if (previous) URL.revokeObjectURL(previous);
              previous = url;
            }
          }
        }
      } catch {
        /* State polling reports the connection status. */
      }
      if (!stopped) timeout = setTimeout(() => void poll(), 120);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timeout);
      if (previous) URL.revokeObjectURL(previous);
    };
  }, [paired]);
  const photoKey = JSON.stringify(state?.photos);
  useEffect(() => setSelected([]), [state?.stage, photoKey]);
  async function pair() {
    setPairing(true);
    setIssue('');
    try {
      await request('/api/pair', { code, name });
      history.replaceState(null, '', location.pathname);
      setPaired(true);
    } catch (error) {
      setIssue(
        error instanceof Error ? error.message : 'Could not pair this device.',
      );
    } finally {
      setPairing(false);
    }
  }
  async function send(
    action: GuestCommand['action'],
    extra: Partial<GuestCommand> = {},
  ) {
    if (lock.current || !current.current || issue) return;
    lock.current = true;
    setBusy(true);
    setActionIssue('');
    const previousRevision = current.current.revision;
    try {
      const value = { ...extra, action, revision: previousRevision };
      if (desktop) {
        const result = await window.vyora.guestSend(value);
        if (!result.ok) throw new Error(result.error);
      } else await request('/api/command', value);
    } catch (error) {
      setActionIssue(
        error instanceof Error
          ? error.message
          : 'Please ask the organizer for help.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const canAct =
    state?.mode === 'self-service' &&
    !busy &&
    !state.busy &&
    !state.paused &&
    !issue;
  return (
    <div
      className={`app-shell kiosk-mode remote-booth kiosk-stage-${state?.stage === 'ready' ? 'capture' : state?.stage || 'idle'}`}
    >
      <main className="guest-screen">
        {!desktop && (
          <button
            className="outline-button guest-fullscreen"
            onClick={() => {
              void document.documentElement
                .requestFullscreen?.()
                .catch(() =>
                  setFullscreenIssue(
                    'Use your browser’s full-screen option for a larger view.',
                  ),
                );
            }}
          >
            Full screen
          </button>
        )}
        {(issue ||
          actionIssue ||
          fullscreenIssue ||
          state?.paused ||
          state?.busy) && (
          <p role="status" className="guest-notice">
            {issue ||
              actionIssue ||
              fullscreenIssue ||
              (state?.paused
                ? 'The booth is paused. Your organizer will resume shortly.'
                : 'Please wait while the organizer prepares the booth or saves your strip.')}
          </p>
        )}
        {!desktop && !paired ? (
          <section className="guest-pair">
            <span className="guest-kicker">CONNECT TO THE BOOTH</span>
            <h1>A little moment awaits.</h1>
            <p>
              Enter the code shown on the organizer’s laptop, then wait for
              approval.
            </p>
            <label>
              Device name
              <input
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Pairing code
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button
              className="primary-button"
              disabled={pairing || code.length !== 6}
              onClick={() => void pair()}
            >
              {pairing ? 'Connecting…' : 'Connect to VYORA'}
            </button>
          </section>
        ) : !state ? (
          <section className="guest-wait">
            <h1>Getting the booth ready.</h1>
            <p>Please wait for your organizer.</p>
          </section>
        ) : (
          <GuestBoothView
            state={state}
            preview={preview}
            canAct={canAct}
            selected={selected}
            onSelect={(id) =>
              setSelected((ids) =>
                ids.includes(id)
                  ? ids.filter((value) => value !== id)
                  : [...ids, id],
              )
            }
            onAction={(action, extra) => void send(action, extra)}
          />
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<GuestScreen />);
