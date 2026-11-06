import { useEffect, useRef, useState } from 'react';
import type {
  DesktopApi,
  GuestCommand,
  GuestSnapshot,
  GuestStatus,
} from '@vyora/shared';

export function useGuestController(
  snapshot: Omit<GuestSnapshot, 'revision'>,
  command: (value: GuestCommand) => Promise<void>,
  video: React.RefObject<HTMLVideoElement | null>,
) {
  const [status, setStatus] = useState<GuestStatus | null>(null);
  const [issue, setIssue] = useState('');
  const [open, setOpen] = useState(false);
  const handler = useRef(command);
  handler.current = command;
  const active = status?.displayId != null || !!status?.tablet;
  const commandLock = useRef(false);
  useEffect(() => {
    if (!window.vyora.onGuestCommand) return;
    return window.vyora.onGuestCommand(async (value) => {
      if (commandLock.current) {
        window.vyora.guestReply(
          value.requestId,
          'Please wait for the current action.',
        );
        return;
      }
      commandLock.current = true;
      try {
        await handler.current(value);
        window.vyora.guestReply(value.requestId);
      } catch (error) {
        window.vyora.guestReply(
          value.requestId,
          error instanceof Error
            ? error.message
            : 'Please ask the organizer for help.',
        );
      } finally {
        commandLock.current = false;
      }
    });
  }, []);
  useEffect(() => {
    if (!window.vyora.guestStatus) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await window.vyora.guestStatus();
        if (!disposed && result.ok) setStatus(result.value);
      } catch {
        if (!disposed) setIssue('Could not check the guest connection.');
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const state = JSON.stringify(snapshot);
  useEffect(() => {
    if (!active) return;
    const publish = () => {
      void window.vyora
        .guestPublish({ ...JSON.parse(state), revision: 0 })
        .then((result) => {
          if (!result.ok) setIssue(result.error);
        })
        .catch(() => setIssue('Could not update the guest display.'));
    };
    publish();
    const heartbeat = setInterval(publish, 2000);
    return () => clearInterval(heartbeat);
  }, [state, active]);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    const canvas = document.createElement('canvas');
    const tick = async () => {
      try {
        const element = video.current;
        if (element?.videoWidth && element.readyState >= 2) {
          // Preview traffic is independent of full-resolution capture and export.
          const width = Math.min(960, element.videoWidth);
          const height = Math.round(
            (element.videoHeight * width) / element.videoWidth,
          );
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          canvas.getContext('2d')?.drawImage(element, 0, 0, width, height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.72),
          );
          if (blob && !stopped && blob.size <= 160000)
            await window.vyora.guestPreview(await blob.arrayBuffer());
        }
      } catch {
        /* State polling surfaces a disconnected controller. */
      }
      if (!stopped) timeout = setTimeout(() => void tick(), 120);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timeout);
      canvas.width = canvas.height = 0;
    };
  }, [active, video]);
  async function configure(input: Parameters<DesktopApi['guestConfigure']>[0]) {
    setIssue('');
    try {
      const result = await window.vyora.guestConfigure(input);
      if (!result.ok) throw new Error(result.error);
      setStatus(result.value);
    } catch (error) {
      setIssue(
        error instanceof Error
          ? error.message
          : 'Could not connect the guest screen.',
      );
    }
  }
  return { status, active, issue, open, setOpen, configure };
}
