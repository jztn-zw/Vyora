import { memo, useEffect, useRef, useState } from 'react';
import { countdownReading } from './countdown-timing';
import './capture-countdown.css';

/** Shared by the operator, full-screen booth, monitors and guest browsers. */
export const CaptureCountdown = memo(function CaptureCountdown({
  value,
  endsAt,
}: {
  value: number | null;
  endsAt?: number | null;
}) {
  const [tick, setTick] = useState(0);
  const reading = countdownReading(endsAt, Date.now(), value);
  useEffect(() => {
    if (value == null) return;
    const next = countdownReading(endsAt, Date.now(), value).nextTick;
    if (next == null) return;
    const timer = setTimeout(() => setTick((current) => current + 1), next);
    return () => clearTimeout(timer);
  }, [endsAt, value, tick]);
  useEffect(() => {
    const refresh = () => setTick((current) => current + 1);
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  if (value == null || reading.seconds == null) return null;
  return (
    <div
      className="countdown"
      role="timer"
      aria-label={`Capturing in ${reading.seconds} seconds`}
    >
      <CountdownDial
        key={`${endsAt}-${reading.seconds}`}
        seconds={reading.seconds}
        elapsed={reading.elapsed}
      />
    </div>
  );
});

function CountdownDial({
  seconds,
  elapsed,
}: {
  seconds: number;
  elapsed: number;
}) {
  // Preview frames must not restart or advance the animation's initial phase.
  const phase = useRef(elapsed);
  return (
    <div className="countdown-dial" aria-hidden="true">
      <svg className="countdown-ring" viewBox="0 0 160 160">
        <circle className="countdown-ring-track" cx="80" cy="80" r="74" />
        <circle
          className="countdown-ring-progress"
          cx="80"
          cy="80"
          r="74"
          pathLength="100"
          style={{ animationDelay: `-${phase.current}ms` }}
        />
      </svg>
      <span className="countdown-number">{seconds}</span>
    </div>
  );
}
