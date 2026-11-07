import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrintJob } from '@vyora/shared';

export function useAutoPrint() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const [issue, setIssue] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const result = await window.vyora.getPrintActivity();
    if (!result.ok) throw new Error(result.error);
    const next = result.value.autoPrint ?? null;
    if (request === generation.current) {
      setJob(next);
      setIssue('');
    }
    return next;
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch {
        if (!stopped)
          setIssue(
            'Could not check printing. Keep this screen open while VYORA reconnects.',
          );
      }
      if (!stopped) timer = setTimeout(() => void poll(), 700);
    };
    void poll();
    return () => {
      stopped = true;
      generation.current++;
      clearTimeout(timer);
    };
  }, [refresh]);
  async function release(checked = false) {
    if (!job) return;
    generation.current++;
    const result = await window.vyora.releaseAutoPrint(job.stripId, checked);
    if (!result.ok) throw new Error(result.error);
    await refresh();
  }
  async function retry() {
    if (!job) return;
    const result = await window.vyora.retryAutoPrint(job.stripId);
    if (!result.ok) throw new Error(result.error);
    await refresh();
  }
  return { job, issue, refresh, release, retry };
}
