/** Translate the host deadline to the guest clock, allowing for request latency. */
export function localCountdownDeadline(
  deadline: number | null | undefined,
  hostTime: number | undefined,
  sentAt: number,
  receivedAt: number,
): number | null {
  if (deadline == null || !Number.isFinite(deadline)) return null;
  if (hostTime == null || !Number.isFinite(hostTime)) return deadline;
  return (
    receivedAt + (deadline - hostTime) - Math.max(0, receivedAt - sentAt) / 2
  );
}

/** Never replay missed digits or show zero while a delayed snapshot catches up. */
export function countdownReading(
  deadline: number | null | undefined,
  now: number,
  fallback: number | null,
): { seconds: number | null; elapsed: number; nextTick: number | null } {
  if (deadline != null && Number.isFinite(deadline)) {
    const remaining = deadline - now;
    if (remaining <= 0 || remaining > 11000)
      return { seconds: null, elapsed: 0, nextTick: null };
    const maximum =
      fallback != null &&
      Number.isInteger(fallback) &&
      fallback > 0 &&
      fallback <= 10
        ? fallback
        : 10;
    const seconds = Math.min(maximum, Math.ceil(remaining / 1000));
    return {
      seconds,
      elapsed: Math.max(0, seconds * 1000 - remaining),
      nextTick: remaining - (seconds - 1) * 1000 + 1,
    };
  }
  return {
    seconds:
      fallback != null &&
      Number.isInteger(fallback) &&
      fallback > 0 &&
      fallback <= 10
        ? fallback
        : null,
    elapsed: 0,
    nextTick: null,
  };
}
