/** Coalesce fast pointer events, but always apply the final update before commit. */
export function createFrameUpdates<T>(
  apply: (value: T) => void,
  request: (callback: () => void) => number,
  cancel: (id: number) => void,
) {
  let frame: number | null = null;
  let pending: T | undefined;
  function clear() {
    if (frame !== null) cancel(frame);
    frame = null;
    pending = undefined;
  }
  function flush() {
    const value = pending;
    clear();
    if (value !== undefined) apply(value);
  }
  return {
    queue(value: T) {
      pending = value;
      if (frame === null)
        frame = request(() => {
          frame = null;
          const latest = pending;
          pending = undefined;
          if (latest !== undefined) apply(latest);
        });
    },
    flush,
    clear,
  };
}
