import { memo, useId, useMemo } from 'react';
import type {
  ShotCount,
  StripTemplate,
  StripTemplateSummary,
} from '@vyora/shared';
import { stripHeight, stripPreviewUrl } from './photo-strip';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { photoSlotTransform } from './template-layout';

/** Shared template artwork for organizer, studio and guest frame previews. */
export const FramePreview = memo(function FramePreview({
  template,
  shots = 4,
}: {
  template?: StripTemplateSummary | StripTemplate;
  shots?: ShotCount;
}) {
  const openingMask = useId();
  const frame = useMemo(() => {
    if (template)
      return {
        ...template,
        source: 'frame' in template ? template.frame : template.preview,
      };
    const height = stripHeight(shots);
    return {
      name: 'Doodle No. 01',
      width: 720,
      height,
      layer: 'overlay',
      source: stripPreviewUrl({
        id: 'frame-preview',
        createdAt: new Date().toISOString(),
        photos: Array.from({ length: shots }, (_, index) => ({
          id: String(index),
          createdAt: '',
          width: 600,
          height: 394,
          thumbnail: '',
        })),
      }),
      slots: Array.from({ length: shots }, (_, index) => ({
        x: 60 / 720,
        y: (64 + index * 430) / height,
        width: 600 / 720,
        height: 394 / height,
        rotation: 0,
      })),
    };
  }, [template, shots]);
  const needsOpeningMask = !template || frame.layer === 'background';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="frame-choice-preview"
      overflow="hidden"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role="img"
      aria-label={`${frame.name}, ${frame.slots.length} photo spaces`}
    >
      {needsOpeningMask && (
        <defs>
          <mask
            id={openingMask}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={frame.width}
            height={frame.height}
          >
            <rect width={frame.width} height={frame.height} fill="white" />
            {frame.slots.map((slot, index) => (
              <rect
                key={index}
                x={slot.x * frame.width}
                y={slot.y * frame.height}
                width={slot.width * frame.width}
                height={slot.height * frame.height}
                fill="black"
                transform={photoSlotTransform(slot, frame.width, frame.height)}
              />
            ))}
          </mask>
        </defs>
      )}
      {frame.slots.map((slot, index) => (
        <g
          key={index}
          transform={photoSlotTransform(slot, frame.width, frame.height)}
        >
          <svg
            data-photo-placeholder={index + 1}
            x={slot.x * frame.width}
            y={slot.y * frame.height}
            width={slot.width * frame.width}
            height={slot.height * frame.height}
            overflow="hidden"
          >
            <PhotoPlaceholder index={index} />
          </svg>
        </g>
      ))}
      <image
        data-layer="frame"
        href={frame.source}
        width={frame.width}
        height={frame.height}
        mask={needsOpeningMask ? `url(#${openingMask})` : undefined}
      />
    </svg>
  );
});
