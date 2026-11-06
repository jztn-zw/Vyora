import { useEffect, useState, type RefObject } from 'react';

// A small, raw camera snapshot; effects are applied separately to each thumbnail.
export function usePhotoEffectPreview(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const capture = () => {
      const element = video.current;
      if (
        !element?.videoWidth ||
        !element.videoHeight ||
        element.readyState < 2
      )
        return;
      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = Math.round(
        (180 * element.videoHeight) / element.videoWidth,
      );
      const context = canvas.getContext('2d');
      if (!context) return;
      try {
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        setPreview(canvas.toDataURL('image/jpeg', 0.75));
      } catch {
        // Keep the sample photo when a camera is still switching or recovering.
      } finally {
        canvas.width = canvas.height = 0;
      }
    };
    capture();
    const retry = setTimeout(capture, 300);
    return () => clearTimeout(retry);
  }, [video, enabled]);
  return preview;
}
