import { useEffect, useRef, useState } from 'react';
import type { PhotoAreaView, PhotoFrameRect } from '@vyora/shared';
import { captureFrameRect } from './photo-framing';
import { createCameraFrameCropper } from './camera-frame';
import './capture-framing.css';

export function useCaptureFraming(
  video: React.RefObject<HTMLVideoElement | null>,
  ready: boolean,
  areas: PhotoAreaView[],
  photoIndex: number,
  tethered: boolean,
) {
  const [framing, setFraming] = useState<PhotoFrameRect>();
  const options = useRef({ areas, photoIndex });
  options.current = { areas, photoIndex };
  const signature = JSON.stringify({
    areas: areas.map(({ width, height, photoIndex: source }) => ({
      width,
      height,
      source,
    })),
    photoIndex,
  });
  useEffect(() => {
    if (!ready) {
      setFraming(undefined);
      return;
    }
    const cropper = tethered ? undefined : createCameraFrameCropper();
    const update = () => {
      const media = video.current;
      if (!media?.videoWidth || !media.videoHeight || media.readyState < 2)
        return;
      try {
        const bands = cropper?.(media);
        const width = bands?.width ?? media.videoWidth;
        const rect = captureFrameRect(
          width,
          media.videoHeight,
          options.current.areas,
          options.current.photoIndex,
        );
        const next = {
          ...rect,
          x: ((bands?.x ?? 0) + rect.x * width) / media.videoWidth,
          width: (rect.width * width) / media.videoWidth,
        };
        setFraming((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      } catch {
        /* The next decoded frame can restore the guide after reconnecting. */
      }
    };
    update();
    const timer = setInterval(update, 600);
    return () => clearInterval(timer);
  }, [video, ready, tethered, signature]);
  return framing;
}

export function CaptureFramingGuide({
  framing,
  media,
  mirrored = false,
}: {
  framing?: PhotoFrameRect;
  media: React.RefObject<HTMLVideoElement | HTMLImageElement | null>;
  mirrored?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({
    width: 0,
    height: 0,
    mediaWidth: 0,
    mediaHeight: 0,
  });
  useEffect(() => {
    const element = root.current;
    const source = media.current;
    if (!element || !source) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const width =
        source instanceof HTMLVideoElement
          ? source.videoWidth
          : source.naturalWidth;
      const height =
        source instanceof HTMLVideoElement
          ? source.videoHeight
          : source.naturalHeight;
      const next = {
        width: rect.width,
        height: rect.height,
        mediaWidth: width,
        mediaHeight: height,
      };
      setBounds((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    source.addEventListener('loadedmetadata', update);
    source.addEventListener('resize', update);
    source.addEventListener('load', update);
    update();
    return () => {
      observer.disconnect();
      source.removeEventListener('loadedmetadata', update);
      source.removeEventListener('resize', update);
      source.removeEventListener('load', update);
    };
  }, [media, !!framing]);
  if (!framing) return null;
  const scale = Math.min(
    bounds.width / bounds.mediaWidth,
    bounds.height / bounds.mediaHeight,
  );
  const width = bounds.mediaWidth * scale;
  const height = bounds.mediaHeight * scale;
  const x =
    (bounds.width - width) / 2 +
    width * (mirrored ? 1 - framing.x - framing.width : framing.x);
  const y = (bounds.height - height) / 2 + height * framing.y;
  const guideWidth = framing.width * width;
  const guideHeight = framing.height * height;
  return (
    <div ref={root} className="capture-framing-guide" aria-hidden="true">
      {Number.isFinite(x) && bounds.mediaWidth > 0 && (
        <>
          <svg width="100%" height="100%">
            <path
              className="capture-framing-shade"
              fillRule="evenodd"
              d={`M0 0H${bounds.width}V${bounds.height}H0Z M${x} ${y}h${guideWidth}v${guideHeight}h${-guideWidth}Z`}
            />
            <rect
              className="capture-framing-border"
              x={x}
              y={y}
              width={guideWidth}
              height={guideHeight}
              rx="2"
            />
          </svg>
          <span
            className="capture-framing-hint"
            style={{ left: x + guideWidth / 2, top: Math.max(48, y + 12) }}
          >
            Keep everyone inside the frame
          </span>
        </>
      )}
    </div>
  );
}
