import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { PhotoSlot, StripTemplate } from '@vyora/shared';
import {
  detectPhotoSlots,
  evenlySpacedSlots,
  adjustPhotoSlot,
  centerPhotoSlots,
  pastePhotoArea,
  matchPhotoAreaSize,
  resizePhotoAreaCount,
  clampPhotoSlotPosition,
  rotatePhotoSlotInPlace,
  pointerRotationDelta,
  validateFourPhotoTemplate,
} from './template-layout';
import type { PhotoAreaHandle } from './template-layout';
import { FramePreview } from './FramePreview';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { EditorNumberField } from './EditorNumberField';
import { createFrameUpdates } from './editor-frame-updates';
import './template-editor.css';
import { StudioSelect } from './StudioSelect';
import {
  emptyTemplateHistory,
  sameTemplateLayout,
  templateHistoryReducer,
} from './template-history';
import type { DraftUpdate } from './template-history';
import {
  clampEditorZoom,
  fitEditorFrame,
  zoomAnchorOffset,
  MIN_EDITOR_ZOOM,
  MAX_EDITOR_ZOOM,
} from './editor-viewport';

const resizeHandles: { handle: PhotoAreaHandle; label: string }[] = [
  { handle: 'nw', label: 'top left corner' },
  { handle: 'ne', label: 'top right corner' },
  { handle: 'se', label: 'bottom right corner' },
  { handle: 'sw', label: 'bottom left corner' },
  { handle: 'n', label: 'top edge' },
  { handle: 'e', label: 'right edge' },
  { handle: 's', label: 'bottom edge' },
  { handle: 'w', label: 'left edge' },
];

function EditorToolIcon({ tool }: { tool: 'select' | 'draw' | 'pan' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tool === 'select' && <path d="m4 4 7.07 17 2.51-7.39L21 11.07z" />}
      {tool === 'draw' && (
        <>
          <rect
            x="3"
            y="3"
            width="15"
            height="15"
            rx="1"
            strokeDasharray="3 3"
          />
          <path d="M18 14v8M14 18h8" />
        </>
      )}
      {tool === 'pan' && (
        <path d="M8 13V5a2 2 0 0 1 4 0v7M12 6a2 2 0 0 1 4 0v6M16 8a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-3 0-5-2-6-4l-3-5a2 2 0 0 1 3-2l2 2" />
      )}
    </svg>
  );
}
type AreaGesture = {
  pointerId: number;
  start: { x: number; y: number };
} & (
  | { kind: 'draw' }
  | {
      kind: 'adjust';
      index: number;
      slot: PhotoSlot;
      handle: PhotoAreaHandle | 'move' | 'rotate';
      rotationTrack?: {
        cx: number;
        cy: number;
        previous: number;
        accumulated: number;
        rebase: boolean;
      };
    }
);

async function loadFrame(file: File) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error('Choose an image smaller than 10 MB.');
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png =
    header[0] === 137 &&
    header[1] === 80 &&
    header[2] === 78 &&
    header[3] === 71;
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (!png && !jpeg) throw new Error('Choose a PNG or JPEG image.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  const sample = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (
      width < 128 ||
      height < 128 ||
      width > 4096 ||
      height > 4096 ||
      width * height > 16000000
    )
      throw new Error(
        'Use an image between 128 and 4096 pixels per side, up to 16 megapixels.',
      );
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read this image.');
    context.drawImage(image, 0, 0);
    const frame = await new Promise<string>((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Could not read this image.'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(blob);
      }, 'image/png'),
    );
    if (frame.length > 14000000)
      throw new Error(
        'This image is too large after import. Try a smaller image.',
      );
    const scale = Math.min(1, 1000 / width, 1000 / height);
    sample.width = Math.max(1, Math.round(width * scale));
    sample.height = Math.max(1, Math.round(height * scale));
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) throw new Error('Could not inspect the photo areas.');
    sampleContext.drawImage(image, 0, 0, sample.width, sample.height);
    const detected = detectPhotoSlots(
      sampleContext.getImageData(0, 0, sample.width, sample.height).data,
      sample.width,
      sample.height,
    );
    return { frame, width, height, detected };
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
    canvas.width = canvas.height = sample.width = sample.height = 0;
  }
}

export function TemplateEditor({
  onClose,
  onSaved,
  initialTemplate,
}: {
  onClose: () => void;
  onSaved: (template: StripTemplate) => void;
  initialTemplate?: StripTemplate;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frameInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const zoomValue = useRef(1);
  const zoomAnchor = useRef<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const pan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewSize, setViewSize] = useState({ width: 500, height: 460 });
  const [tool, setTool] = useState<'edit' | 'draw' | 'hand'>('edit');
  const [panning, setPanning] = useState(false);
  const [rotating, setRotating] = useState(false);
  const gesture = useRef<AreaGesture | null>(null);
  const [history, dispatchHistory] = useReducer(
    templateHistoryReducer,
    undefined,
    emptyTemplateHistory,
  );
  const draft = history.draft;
  const areaUpdates = useMemo(
    () =>
      createFrameUpdates<{ index: number; slot: PhotoSlot }>(
        ({ index, slot }) =>
          dispatchHistory({
            type: 'edit',
            update: (current) =>
              current && {
                ...current,
                slots: current.slots.map((area, i) =>
                  i === index ? slot : area,
                ),
              },
          }),
        (callback) => requestAnimationFrame(callback),
        (id) => cancelAnimationFrame(id),
      ),
    [dispatchHistory],
  );
  useEffect(() => () => areaUpdates.clear(), [areaUpdates]);
  function setDraft(update: DraftUpdate) {
    dispatchHistory({ type: 'edit', update });
  }
  const [selected, setSelected] = useState(-1);
  const [copiedArea, setCopiedArea] = useState<PhotoSlot | null>(null);
  const [drag, setDrag] = useState<PhotoSlot | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!initialTemplate) return;
    dispatchHistory({ type: 'load', draft: initialTemplate });
    setSelected(-1);
    setNotice('Edit the name, photo areas, and tilt, then save your changes.');
  }, [initialTemplate]);
  const hasDraft = !!draft;
  const zoomTo = useCallback(
    (value: number, clientX?: number, clientY?: number) => {
      if (
        !viewport.current ||
        !canvas.current ||
        gesture.current ||
        pan.current
      )
        return;
      const next = clampEditorZoom(value);
      if (next === zoomValue.current) return;
      const bounds = viewport.current.getBoundingClientRect();
      const frame = canvas.current.getBoundingClientRect();
      const x = clientX ?? bounds.left + viewport.current.clientWidth / 2;
      const y = clientY ?? bounds.top + viewport.current.clientHeight / 2;
      zoomAnchor.current = {
        x: (x - frame.left) / frame.width,
        y: (y - frame.top) / frame.height,
        clientX: x,
        clientY: y,
      };
      zoomValue.current = next;
      setZoom(next);
    },
    [],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasDraft]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      // A non-passive listener keeps wheel zoom local to the editing surface.
      event.preventDefault();
      if (busy || saving || !event.deltaY) return;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element!.clientHeight
            : 1);
      zoomTo(
        zoomValue.current *
          Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.002),
        event.clientX,
        event.clientY,
      );
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [hasDraft, busy, saving, zoomTo]);
  const fittedFrame = draft
    ? fitEditorFrame(draft.width, draft.height, viewSize.width, viewSize.height)
    : { width: 1, height: 1 };
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (!anchor || !viewport.current || !canvas.current) return;
    zoomAnchor.current = null;
    const bounds = canvas.current.getBoundingClientRect();
    viewport.current.scrollLeft += zoomAnchorOffset(
      bounds.left,
      bounds.width,
      anchor.x,
      anchor.clientX,
    );
    viewport.current.scrollTop += zoomAnchorOffset(
      bounds.top,
      bounds.height,
      anchor.y,
      anchor.clientY,
    );
  }, [zoom, fittedFrame.width, fittedFrame.height]);
  function fitView() {
    if (gesture.current || pan.current) return;
    zoomAnchor.current = null;
    zoomValue.current = 1;
    setZoom(1);
    viewport.current?.scrollTo({ left: 0, top: 0 });
  }
  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      (event.button !== 1 && !(event.button === 0 && tool === 'hand')) ||
      gesture.current ||
      busy ||
      saving
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    pan.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pan.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.scrollLeft = active.left - (event.clientX - active.x);
    event.currentTarget.scrollTop = active.top - (event.clientY - active.y);
  }
  function endPan(event?: ReactPointerEvent<HTMLDivElement>) {
    const active = pan.current;
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    event?.stopPropagation();
    pan.current = null;
    setPanning(false);
    if (viewport.current?.hasPointerCapture(active.pointerId))
      viewport.current.releasePointerCapture(active.pointerId);
  }

  async function importFrame(file: File) {
    setBusy(true);
    setError('');
    try {
      const loaded = await loadFrame(file);
      dispatchHistory({
        type: 'load',
        draft: {
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 64),
          width: loaded.width,
          height: loaded.height,
          frame: loaded.frame,
          slots: loaded.detected.slots,
          layer: loaded.detected.layer,
        },
      });
      setSelected(loaded.detected.slots.length ? 0 : -1);
      zoomAnchor.current = null;
      zoomValue.current = 1;
      setZoom(1);
      setTool('edit');
      viewport.current?.scrollTo({ left: 0, top: 0 });
      setPreview(false);
      setNotice(
        loaded.detected.detected
          ? `${loaded.detected.slots.length} photo areas detected. Check their edges and order before saving.`
          : 'No clear photo areas detected. Draw them on the image, or start with an evenly spaced layout.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not read this image.',
      );
    } finally {
      setBusy(false);
    }
  }
  function point(event: ReactPointerEvent, bounded = true) {
    const rect = canvas.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: bounded ? Math.max(0, Math.min(1, x)) : x,
      y: bounded ? Math.max(0, Math.min(1, y)) : y,
    };
  }
  function rectangle(event: ReactPointerEvent): PhotoSlot | null {
    const active = gesture.current;
    if (!active || active.kind !== 'draw') return null;
    const start = active.start;
    const end = point(event);
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }
  function updateArea(index: number, slot: PhotoSlot) {
    if (!draft) return;
    const fitted = clampPhotoSlotPosition(slot);
    setDraft(
      (current) =>
        current && {
          ...current,
          slots: current.slots.map((area, i) => (i === index ? fitted : area)),
        },
    );
  }
  function beginAdjustment(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    handle: PhotoAreaHandle | 'move' | 'rotate',
  ) {
    event.stopPropagation();
    if (
      !draft ||
      preview ||
      tool !== 'edit' ||
      saving ||
      busy ||
      event.button !== 0 ||
      gesture.current
    )
      return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    setSelected(index);
    dispatchHistory({ type: 'begin' });
    gesture.current = {
      kind: 'adjust',
      pointerId: event.pointerId,
      start: point(event, handle !== 'rotate'),
      index,
      slot: { ...draft.slots[index] },
      handle,
    };
    if (handle === 'rotate') {
      const bounds = canvas.current!.getBoundingClientRect();
      const slot = draft.slots[index];
      const cx = bounds.left + (slot.x + slot.width / 2) * bounds.width;
      const cy = bounds.top + (slot.y + slot.height / 2) * bounds.height;
      gesture.current.rotationTrack = {
        cx,
        cy,
        previous: Math.atan2(event.clientY - cy, event.clientX - cx),
        accumulated: 0,
        rebase: false,
      };
      setRotating(true);
    }
    canvas.current!.setPointerCapture(event.pointerId);
  }
  function moveGesture(event: ReactPointerEvent) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'draw') setDrag(rectangle(event));
    else {
      if (!draft) return;
      if (active.handle === 'rotate') {
        const track = active.rotationTrack;
        if (!track) return;
        const dx = event.clientX - track.cx,
          dy = event.clientY - track.cy;
        if (Math.hypot(dx, dy) < 12) {
          track.rebase = true;
          return;
        }
        const next = Math.atan2(dy, dx);
        if (!track.rebase)
          track.accumulated += pointerRotationDelta(track.previous, next);
        track.previous = next;
        track.rebase = false;
        let rotation = (active.slot.rotation ?? 0) + track.accumulated;
        if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
        const slot = rotatePhotoSlotInPlace(active.slot, rotation);
        areaUpdates.queue({ index: active.index, slot });
        return;
      }
      const end = point(event);
      areaUpdates.queue({
        index: active.index,
        slot: clampPhotoSlotPosition(
          adjustPhotoSlot(
            active.slot,
            active.handle,
            end.x - active.start.x,
            end.y - active.start.y,
            draft.width / draft.height,
          ),
        ),
      });
    }
  }
  function finishGesture(event: ReactPointerEvent) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || !draft) return;
    if (active.kind === 'draw') {
      const slot = rectangle(event);
      if (
        slot &&
        slot.width >= 0.02 &&
        slot.height >= 0.02 &&
        draft.slots.length < 4
      ) {
        setDraft({ ...draft, slots: [...draft.slots, slot] });
        setSelected(draft.slots.length);
        setTool('edit');
      }
    } else {
      moveGesture(event);
      areaUpdates.flush();
      dispatchHistory({ type: 'commit' });
    }
    gesture.current = null;
    setRotating(false);
    setDrag(null);
    if (canvas.current?.hasPointerCapture(event.pointerId))
      canvas.current.releasePointerCapture(event.pointerId);
  }
  function cancelGesture(event?: ReactPointerEvent) {
    const active = gesture.current;
    if (event && active && active.pointerId !== event.pointerId) return;
    gesture.current = null;
    areaUpdates.clear();
    setRotating(false);
    setDrag(null);
    if (active?.kind === 'adjust') dispatchHistory({ type: 'cancel' });
    if (active && canvas.current?.hasPointerCapture(active.pointerId))
      canvas.current.releasePointerCapture(active.pointerId);
  }
  function adjustWithKeyboard(
    event: ReactKeyboardEvent,
    index: number,
    handle: PhotoAreaHandle | 'move',
  ) {
    if (!draft || saving || busy || gesture.current) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.01 : 0.001;
    updateArea(
      index,
      adjustPhotoSlot(
        draft.slots[index],
        handle,
        direction[0] * step,
        direction[1] * step,
        draft.width / draft.height,
      ),
    );
    setSelected(index);
  }
  function centerAreas(all: boolean) {
    if (!draft) return;
    setDraft({
      ...draft,
      slots: centerPhotoSlots(draft.slots, all ? undefined : selected),
    });
    setNotice(
      all
        ? 'All photo areas centered horizontally. Vertical positions kept.'
        : `Photo ${selected + 1} centered horizontally. Vertical position kept.`,
    );
  }
  function startDrawing() {
    if (!draft || draft.slots.length >= 4 || busy || saving || gesture.current)
      return;
    setSelected(-1);
    setPreview(false);
    setTool('draw');
    setNotice(
      'Drag a rectangle over the next photo opening. Select an area to adjust it afterward.',
    );
  }
  function changeAreaCount(count: number) {
    if (
      !draft ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 4 ||
      count === draft.slots.length ||
      busy ||
      saving ||
      gesture.current ||
      pan.current
    )
      return;
    const previous = draft.slots.length;
    setDraft({
      ...draft,
      slots: resizePhotoAreaCount(draft.slots, count, history.initial?.slots),
    });
    setSelected(
      count > previous ? count - 1 : selected < count ? selected : -1,
    );
    setTool('edit');
    setPreview(false);
    setError('');
    setNotice(
      count > previous
        ? 'Photo area added. Select it on the canvas to adjust its position and size.'
        : 'Last photo areas removed. Use Undo to restore them.',
    );
  }
  function changeSlot(key: keyof PhotoSlot, percent: number) {
    if (!draft || selected < 0 || !Number.isFinite(percent)) return;
    const slot = {
      ...draft.slots[selected],
      [key]: Math.max(0, Math.min(100, percent)) / 100,
    };
    slot.width = Math.max(0.02, Math.min(slot.width, 1 - slot.x));
    slot.height = Math.max(0.02, Math.min(slot.height, 1 - slot.y));
    slot.x = Math.min(slot.x, 1 - slot.width);
    slot.y = Math.min(slot.y, 1 - slot.height);
    updateArea(selected, slot);
  }
  function tiltArea(degrees: number) {
    if (
      !draft?.slots[selected] ||
      !Number.isFinite(degrees) ||
      busy ||
      saving ||
      gesture.current ||
      pan.current
    )
      return;
    updateArea(
      selected,
      rotatePhotoSlotInPlace(draft.slots[selected], degrees),
    );
  }
  function removeSelectedArea() {
    if (
      !draft?.slots[selected] ||
      busy ||
      saving ||
      gesture.current ||
      pan.current
    )
      return false;
    const index = selected;
    setDraft(
      (current) =>
        current && {
          ...current,
          slots: current.slots.filter((_, i) => i !== index),
        },
    );
    setSelected(-1);
    setError('');
    setNotice(
      `Photo area ${index + 1} removed. Use Undo or Ctrl+Z to restore it.`,
    );
    viewport.current?.focus({ preventScroll: true });
    return true;
  }
  function historyAction(type: 'undo' | 'redo' | 'revert') {
    if (busy || saving || gesture.current || pan.current) return;
    dispatchHistory({ type });
    setSelected(-1);
    setError('');
    setNotice(
      type === 'undo'
        ? 'Last layout edit undone.'
        : type === 'redo'
          ? 'Layout edit redone.'
          : 'Original imported layout restored. You can undo this change.',
    );
  }
  function copyArea(cut = false) {
    if (
      !draft?.slots[selected] ||
      busy ||
      saving ||
      gesture.current ||
      pan.current
    )
      return;
    setCopiedArea({ ...draft.slots[selected] });
    if (cut) removeSelectedArea();
    setNotice(
      cut
        ? 'Area cut. Paste it with Ctrl+V. Undo restores the removed area.'
        : 'Area copied. Use Ctrl+V to paste its size and shape in this editor.',
    );
  }
  function pasteArea(source = copiedArea) {
    if (!draft || !source || busy || saving || gesture.current || pan.current)
      return;
    const slots = pastePhotoArea(draft.slots, source);
    if (!slots) {
      setNotice(
        'This frame already has 4 photo areas. Remove an area before pasting.',
      );
      return;
    }
    const fitted = clampPhotoSlotPosition(slots[slots.length - 1]);
    slots[slots.length - 1] = fitted;
    setDraft({ ...draft, slots });
    setSelected(slots.length - 1);
    setTool('edit');
    setPreview(false);
    setError('');
    setNotice(
      `Photo ${slots.length} added with the copied size. Drag it into place. Undo removes this copy.`,
    );
    viewport.current?.focus({ preventScroll: true });
  }
  function pasteSize() {
    if (
      !draft?.slots[selected] ||
      !copiedArea ||
      busy ||
      saving ||
      gesture.current ||
      pan.current
    )
      return;
    const matched = clampPhotoSlotPosition(
      matchPhotoAreaSize(draft.slots[selected], copiedArea),
    );
    setDraft({
      ...draft,
      slots: draft.slots.map((slot, i) => (i === selected ? matched : slot)),
    });
    setNotice(
      `Photo ${selected + 1} now matches the copied area’s size. Its position stays inside the frame.`,
    );
    setError('');
  }
  async function save() {
    setError('');
    try {
      const value = validateFourPhotoTemplate(draft);
      setSaving(true);
      const result = initialTemplate
        ? await window.vyora.updateTemplate(initialTemplate.id, value)
        : await window.vyora.saveTemplate(value);
      if (!result.ok) throw new Error(result.error);
      onSaved(result.value);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this template.',
      );
    } finally {
      setSaving(false);
    }
  }
  const canPreview = !!draft?.slots.length;
  const selectedArea = draft?.slots[selected] ?? null;

  return (
    <dialog
      ref={dialog}
      className="template-dialog"
      aria-labelledby="template-heading"
      onPointerMoveCapture={(event) => {
        if (gesture.current) moveGesture(event);
      }}
      onPointerUpCapture={(event) => {
        if (gesture.current) finishGesture(event);
      }}
      onPointerCancelCapture={(event) => {
        if (gesture.current) cancelGesture(event);
      }}
      onPointerDownCapture={(event) => {
        if (
          event.button !== 0 ||
          tool !== 'edit' ||
          busy ||
          saving ||
          gesture.current ||
          pan.current ||
          !(event.target instanceof Element) ||
          event.target.closest(
            '.template-photo-area, .template-controls, button, input, textarea, select, label, a, summary, [role="button"], [role="combobox"], [role="listbox"], [contenteditable="true"]',
          )
        )
          return;
        setSelected(-1);
        viewport.current?.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        const target = event.target as HTMLElement;
        const editingText =
          target.isContentEditable ||
          !!target.closest(
            'input, textarea, select, [role="combobox"], [role="listbox"]',
          );
        const command = (event.ctrlKey || event.metaKey) && !event.altKey;
        const key = event.key.toLowerCase();
        if (
          !command &&
          !event.altKey &&
          !editingText &&
          !preview &&
          (event.key === '[' || event.key === ']')
        ) {
          event.preventDefault();
          event.stopPropagation();
          tiltArea(
            (draft?.slots[selected]?.rotation ?? 0) +
              (event.key === '[' ? -1 : 1) * (event.shiftKey ? 15 : 1),
          );
          return;
        }
        if (
          command &&
          event.shiftKey &&
          key === 'v' &&
          !editingText &&
          !preview
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) pasteSize();
          return;
        }
        if (command && key === 's') {
          event.preventDefault();
          event.stopPropagation();
          if (
            !event.repeat &&
            draft &&
            draft.slots.length === 4 &&
            !busy &&
            !saving &&
            !gesture.current &&
            !pan.current
          )
            void save();
          return;
        }
        if (
          command &&
          !event.shiftKey &&
          !editingText &&
          !preview &&
          ['c', 'x', 'v', 'd'].includes(key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          if (key === 'c' || key === 'x') copyArea(key === 'x');
          else if (key === 'v') pasteArea();
          else if (draft?.slots[selected]) pasteArea(draft.slots[selected]);
          return;
        }
        if (
          !command &&
          !event.altKey &&
          !event.shiftKey &&
          !editingText &&
          draft &&
          !busy &&
          !saving &&
          !gesture.current &&
          !pan.current
        ) {
          const area = Number(key) - 1;
          if (['v', 'r', 'h', 'f'].includes(key) || /^[1-4]$/.test(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === 'f') fitView();
            else if (key === 'h') setTool('hand');
            else if (key === 'r') startDrawing();
            else if (key === 'v') {
              setTool('edit');
              setPreview(false);
            } else if (draft.slots[area]) {
              setSelected(area);
              setTool('edit');
              setPreview(false);
              viewport.current?.focus({ preventScroll: true });
            }
            return;
          }
        }
        if (
          !command &&
          !event.altKey &&
          !editingText &&
          !preview &&
          tool === 'edit' &&
          selected >= 0 &&
          !busy &&
          !saving &&
          !pan.current &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key,
          )
        ) {
          adjustWithKeyboard(event, selected, 'move');
          return;
        }
        if (
          (event.key === 'Backspace' || event.key === 'Delete') &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey &&
          !event.repeat &&
          !event.nativeEvent.isComposing &&
          !editingText &&
          !preview
        ) {
          if (removeSelectedArea()) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !editingText) {
          const key = event.key.toLowerCase();
          if (key === 'z' || key === 'y') {
            event.preventDefault();
            event.stopPropagation();
            const action = key === 'y' || event.shiftKey ? 'redo' : 'undo';
            if (action === 'undo' ? history.past.length : history.future.length)
              historyAction(action);
            return;
          }
        }
        if (event.key === 'Escape' && pan.current) {
          event.preventDefault();
          event.stopPropagation();
          endPan();
          return;
        }
        if (event.key === 'Escape' && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          cancelGesture();
          return;
        }
        if (
          event.key === 'Escape' &&
          !editingText &&
          (selected >= 0 || tool === 'draw')
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSelected(-1);
          setTool('edit');
        }
      }}
      onCancel={(event) => {
        // A file input also emits a bubbling cancel event. Only an Escape
        // request from this dialog should dismiss the template editor.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!saving && !busy) onClose();
      }}
    >
      <div className="template-dialog-scroll">
        <header className="template-dialog-header">
          <div>
            <p>FRAME STUDIO</p>
            <h2 id="template-heading">Template editor</h2>
            <span>
              {initialTemplate
                ? 'Edit your saved photo areas, then save changes.'
                : 'Import your frame, place the photo areas, then save.'}
            </span>
          </div>
          <button
            type="button"
            className="outline-button template-close-button"
            disabled={busy || saving}
            onClick={onClose}
            aria-label="Close template editor"
          >
            Close
          </button>
        </header>
        {error && (
          <p className="template-error" role="alert">
            {error}
          </p>
        )}
        <div className="template-import-bar">
          <label className="template-upload-button" hidden={!!initialTemplate}>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" />
            </svg>
            {busy
              ? 'Reading image…'
              : draft
                ? 'Replace image'
                : 'Import a frame'}
            <input
              ref={frameInput}
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy || saving || !!initialTemplate}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFrame(file);
              }}
            />
          </label>
          <span>
            {draft
              ? `${draft.width} × ${draft.height} px · ${draft.slots.length} photo areas`
              : 'Up to 10 MB · 128–4096 px per side'}
          </span>
        </div>
        {draft ? (
          <div className="template-editor-layout">
            <section
              className="template-workspace"
              aria-label="Template preview and photo area editor"
            >
              <div className="template-workspace-heading">
                <div>
                  <strong>
                    Your canvas
                    <span
                      className="template-canvas-focus-label"
                      aria-hidden="true"
                    >
                      Keyboard active
                    </span>
                  </strong>
                  <span>{draft.slots.length} of 4 photo areas</span>
                </div>
                <div
                  className="template-view-tabs"
                  role="group"
                  aria-label="Canvas view"
                >
                  <button
                    aria-pressed={!preview}
                    onClick={() => setPreview(false)}
                  >
                    Edit layout
                  </button>
                  <button
                    aria-pressed={preview}
                    disabled={!canPreview}
                    onClick={() => setPreview(true)}
                  >
                    Preview
                  </button>
                </div>
              </div>
              <div
                className="template-editor-toolbar"
                aria-label="Editor tools"
              >
                <div
                  className="template-tool-buttons"
                  role="group"
                  aria-label="Editing mode"
                >
                  <button
                    type="button"
                    aria-pressed={tool === 'edit' && !preview}
                    disabled={busy || saving}
                    onClick={() => {
                      setTool('edit');
                      setPreview(false);
                    }}
                    title="Select, move and resize photo areas (V)"
                    aria-label="Select photo areas"
                    className="template-mode-icon"
                  >
                    <EditorToolIcon tool="select" />
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'draw' && !preview}
                    disabled={busy || saving || draft.slots.length >= 4}
                    onClick={startDrawing}
                    title="Draw a rectangle for a new photo area (R)"
                    aria-label="Draw photo area"
                    className="template-mode-icon"
                  >
                    <EditorToolIcon tool="draw" />
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'hand'}
                    disabled={busy || saving}
                    onClick={() => setTool('hand')}
                    title="Drag to move around the zoomed frame (H)"
                    aria-label="Pan canvas"
                    className="template-mode-icon"
                  >
                    <EditorToolIcon tool="pan" />
                  </button>
                </div>
                <div
                  className="template-history-controls"
                  role="group"
                  aria-label="Layout history"
                >
                  <button
                    type="button"
                    disabled={
                      busy ||
                      saving ||
                      !!history.pending ||
                      !history.past.length
                    }
                    onClick={() => historyAction('undo')}
                    title="Undo layout edit (Ctrl+Z)"
                    aria-label="Undo layout edit"
                    className="template-history-icon"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      saving ||
                      !!history.pending ||
                      !history.future.length
                    }
                    onClick={() => historyAction('redo')}
                    title="Redo layout edit (Ctrl+Shift+Z or Ctrl+Y)"
                    aria-label="Redo layout edit"
                    className="template-history-icon"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m15 4 5 5-5 5M20 9H10a6 6 0 0 0 0 12h3" />
                    </svg>
                  </button>
                </div>
                <div
                  className="template-zoom-controls"
                  role="group"
                  aria-label="Zoom controls"
                >
                  <button
                    type="button"
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_EDITOR_ZOOM || busy || saving}
                    onClick={() => zoomTo(zoomValue.current / 1.25)}
                  >
                    −
                  </button>
                  <output aria-label="Zoom level">
                    {Math.round(zoom * 100)}%
                  </output>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    disabled={zoom >= MAX_EDITOR_ZOOM || busy || saving}
                    onClick={() => zoomTo(zoomValue.current * 1.25)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={busy || saving}
                    onClick={fitView}
                    title="Fit the entire frame in the editor (F)"
                  >
                    Fit
                  </button>
                </div>
              </div>
              <p
                className="template-navigation-hint"
                id="template-navigation-hint"
              >
                Scroll to zoom · Pan to move around · Fit to see the whole frame
              </p>
              <div
                ref={viewport}
                className={`template-viewport ${tool === 'hand' ? 'hand-tool' : ''} ${panning ? 'is-panning' : ''}`}
                tabIndex={0}
                role="region"
                aria-label="Zoomable template canvas"
                aria-describedby="template-navigation-hint"
                onPointerDownCapture={beginPan}
                onPointerMoveCapture={movePan}
                onPointerUpCapture={endPan}
                onPointerCancelCapture={endPan}
                onLostPointerCapture={endPan}
                onAuxClick={(event) => {
                  if (event.button === 1) event.preventDefault();
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (
                    event.key === '+' ||
                    event.key === '=' ||
                    event.key === '-'
                  ) {
                    event.preventDefault();
                    zoomTo(
                      zoomValue.current * (event.key === '-' ? 1 / 1.25 : 1.25),
                    );
                  } else if (event.key === '0') {
                    event.preventDefault();
                    fitView();
                  }
                }}
              >
                <div
                  className="template-stage"
                  style={{
                    width: fittedFrame.width * zoom + 48,
                    height: fittedFrame.height * zoom + 48,
                  }}
                >
                  <div
                    ref={canvas}
                    className={`template-canvas ${preview ? 'is-preview' : ''} ${tool === 'draw' && !preview ? 'is-drawing' : ''} ${rotating ? 'is-rotating' : ''}`}
                    style={{
                      width: fittedFrame.width * zoom,
                      height: fittedFrame.height * zoom,
                    }}
                    onPointerDown={(event) => {
                      if (
                        preview ||
                        tool !== 'draw' ||
                        busy ||
                        saving ||
                        gesture.current ||
                        event.button !== 0
                      )
                        return;
                      event.preventDefault();
                      setSelected(-1);
                      if (draft.slots.length >= 4) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      gesture.current = {
                        kind: 'draw',
                        pointerId: event.pointerId,
                        start: point(event),
                      };
                      setDrag(null);
                    }}
                    onLostPointerCapture={cancelGesture}
                  >
                    {preview ? (
                      <div className="template-sample-preview">
                        <FramePreview
                          template={{ ...draft, id: 'editor-preview' }}
                        />
                      </div>
                    ) : (
                      <img
                        draggable={false}
                        src={draft.frame}
                        alt="Uploaded frame: draw a rectangle for each photo"
                      />
                    )}
                    {!preview && (
                      <div
                        className="template-photo-fill-layer"
                        aria-hidden="true"
                      >
                        {draft.slots.map((slot, index) => (
                          <div
                            key={index}
                            className="template-photo-fill"
                            style={{
                              left: `${slot.x * 100}%`,
                              top: `${slot.y * 100}%`,
                              width: `${slot.width * 100}%`,
                              height: `${slot.height * 100}%`,
                              transform: `rotate(${slot.rotation ?? 0}deg)`,
                              transformOrigin: 'center',
                            }}
                          >
                            <PhotoPlaceholder index={index} />
                          </div>
                        ))}
                      </div>
                    )}
                    {!preview &&
                      draft.slots.map((slot, index) => (
                        <div
                          key={index}
                          className={`template-photo-area ${selected === index ? 'selected' : ''}`}
                          style={{
                            left: `${slot.x * 100}%`,
                            top: `${slot.y * 100}%`,
                            width: `${slot.width * 100}%`,
                            height: `${slot.height * 100}%`,
                            transform: `rotate(${slot.rotation ?? 0}deg)`,
                            transformOrigin: 'center',
                          }}
                        >
                          <button
                            type="button"
                            className="template-photo-move"
                            aria-label={`Move photo area ${index + 1}. Use arrow keys; hold Shift for larger steps.`}
                            aria-pressed={selected === index}
                            disabled={saving || busy}
                            onPointerDown={(event) =>
                              beginAdjustment(event, index, 'move')
                            }
                            onClick={() => setSelected(index)}
                            onKeyDown={(event) =>
                              adjustWithKeyboard(event, index, 'move')
                            }
                          />
                          <b>{index + 1}</b>
                          {selected === index && (
                            <button
                              type="button"
                              className="template-rotate-handle"
                              aria-label={`Rotate photo ${index + 1}. Use left and right arrow keys; Shift rotates in 15 degree steps.`}
                              title="Drag to tilt · Hold Shift to snap to 15°"
                              disabled={busy || saving}
                              onPointerDown={(event) =>
                                beginAdjustment(event, index, 'rotate')
                              }
                              onKeyDown={(event) => {
                                if (
                                  [
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'ArrowUp',
                                    'ArrowDown',
                                  ].includes(event.key)
                                ) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  tiltArea(
                                    (slot.rotation ?? 0) +
                                      (event.key === 'ArrowLeft' ||
                                      event.key === 'ArrowDown'
                                        ? -1
                                        : 1) *
                                        (event.shiftKey ? 15 : 1),
                                  );
                                }
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6v5h-5M20 11a8 8 0 1 0-2 7" />
                              </svg>
                            </button>
                          )}
                          {selected === index &&
                            resizeHandles.map(({ handle, label }) => (
                              <button
                                key={handle}
                                type="button"
                                className={`template-resize-handle handle-${handle}`}
                                aria-label={`Resize photo ${index + 1}: ${label}. Use arrow keys; hold Shift for larger steps.`}
                                disabled={saving || busy}
                                onPointerDown={(event) =>
                                  beginAdjustment(event, index, handle)
                                }
                                onKeyDown={(event) =>
                                  adjustWithKeyboard(event, index, handle)
                                }
                              />
                            ))}
                        </div>
                      ))}
                    {!preview && drag && (
                      <span
                        className="template-photo-area drawing"
                        style={{
                          left: `${drag.x * 100}%`,
                          top: `${drag.y * 100}%`,
                          width: `${drag.width * 100}%`,
                          height: `${drag.height * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <p className="template-draw-hint">
                {preview
                  ? 'Preview only. Your captured photos will replace these samples.'
                  : tool === 'draw'
                    ? 'Drag a rectangle over a photo opening. Mark 4 photo areas for each frame.'
                    : selected < 0
                      ? 'Select an area to move it. Use Draw area to add another photo opening.'
                      : `Photo ${selected + 1} selected. Drag to move; drag a corner to resize. Backspace or Delete removes it.`}
              </p>
            </section>
            <aside className="template-controls">
              <div className="template-inspector-heading">
                <strong>Frame details</strong>
                <span>Make it ready for your next session.</span>
              </div>
              <label>
                Template name
                <input
                  maxLength={64}
                  value={draft.name}
                  disabled={saving}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <div className="template-notice" role="status">
                {notice}
              </div>
              <fieldset disabled={saving || busy || !!history.pending}>
                <legend>Photo areas</legend>
                <p className="template-section-hint">
                  Set the count, then select an area on the canvas to adjust it.
                </p>
                <div className="template-geometry-fields">
                  <EditorNumberField
                    label="Number of areas"
                    value={draft.slots.length}
                    min={0}
                    max={4}
                    step={1}
                    describedBy="template-area-count-hint"
                    onChange={changeAreaCount}
                  />
                  <EditorNumberField
                    label="Tilt"
                    value={selectedArea ? (selectedArea.rotation ?? 0) : null}
                    min={-180}
                    max={180}
                    step={0.1}
                    disabled={!selectedArea}
                    onChange={tiltArea}
                  />
                </div>
                <p
                  id="template-area-count-hint"
                  className="template-count-hint"
                >
                  Mark 4 areas to save. The down arrow removes the last area.
                  Undo restores it.
                </p>
              </fieldset>
              <fieldset disabled={saving || busy || !draft.slots.length}>
                <legend>Auto center</legend>
                <div className="template-center-actions">
                  <button
                    disabled={selected < 0 || saving || busy}
                    onClick={() => centerAreas(false)}
                  >
                    Center selected
                  </button>
                  <button onClick={() => centerAreas(true)}>Center all</button>
                </div>
                <p className="template-center-hint">
                  Centers horizontally. Keeps each area’s size and vertical
                  position.
                </p>
              </fieldset>
              <details className="template-advanced">
                <summary>Advanced settings</summary>
                <div className="template-advanced-content">
                  {selected >= 0 && draft.slots[selected] && (
                    <fieldset disabled={saving || busy}>
                      <legend>
                        Photo {selected + 1} · precise size & position
                      </legend>
                      <div className="template-measurements">
                        {(['x', 'y', 'width', 'height'] as const).map((key) => (
                          <EditorNumberField
                            key={key}
                            label={
                              {
                                x: 'Left (%)',
                                y: 'Top (%)',
                                width: 'Width (%)',
                                height: 'Height (%)',
                              }[key]
                            }
                            value={draft.slots[selected][key]}
                            min={0}
                            max={100}
                            step={0.1}
                            disabled={busy || saving || !!history.pending}
                            onChange={(value) => changeSlot(key, value)}
                          />
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <fieldset disabled={saving || busy || !!history.pending}>
                    <legend>Quick layouts</legend>
                    <div className="template-quick-layouts">
                      <button
                        onClick={() => {
                          setDraft({
                            ...draft,
                            slots: evenlySpacedSlots(4),
                          });
                          setSelected(-1);
                          setPreview(false);
                          setNotice(
                            'Starter layout applied. Adjust each area to match your artwork.',
                          );
                        }}
                      >
                        Set 4 photo areas
                      </button>
                    </div>
                  </fieldset>
                  <div className="template-select-field">
                    <span>Frame position</span>
                    <StudioSelect
                      label="Frame position"
                      value={draft.layer}
                      disabled={saving || busy || !!history.pending}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          layer: value as 'overlay' | 'background',
                        })
                      }
                      options={[
                        {
                          value: 'overlay',
                          label: 'Above photos',
                          description: 'Transparent PNG frame',
                        },
                        {
                          value: 'background',
                          label: 'Behind photos',
                          description: 'JPEG or opaque PNG frame',
                        },
                      ]}
                    />
                  </div>
                  <p className="template-control-hint">
                    Use “Above photos” for transparent openings. Use “Behind
                    photos” to cover areas in an opaque image.
                  </p>
                  <button
                    type="button"
                    className="template-revert-button"
                    disabled={
                      busy ||
                      saving ||
                      !!history.pending ||
                      !history.initial ||
                      sameTemplateLayout(draft, history.initial)
                    }
                    onClick={() => historyAction('revert')}
                    title="Restore the photo areas and frame position from this image’s import"
                  >
                    Revert layout
                  </button>
                </div>
              </details>
              <details className="template-advanced template-shortcuts">
                <summary>Keyboard shortcuts</summary>
                <dl>
                  {[
                    ['Ctrl+C / Ctrl+V', 'Copy / paste an area'],
                    ['Ctrl+X', 'Cut selected area'],
                    ['Ctrl+Shift+V', 'Paste size onto selected area'],
                    ['Ctrl+D', 'Duplicate selected area'],
                    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
                    ['Backspace / Delete', 'Remove selected area'],
                    ['Arrow keys', 'Move selected area'],
                    ['Shift + arrows', 'Move in larger steps'],
                    ['1–4', 'Select a photo area'],
                    ['V / R / H', 'Select / draw / pan'],
                    ['F', 'Fit frame to canvas'],
                    ['[ / ]', 'Tilt selected area by 1°'],
                    ['Esc', 'Cancel drag or clear selection'],
                    ['Ctrl+S', 'Save & use template'],
                  ].map(([keys, action]) => (
                    <div key={keys}>
                      <dt>{keys}</dt>
                      <dd>{action}</dd>
                    </div>
                  ))}
                </dl>
                <p className="template-section-hint">
                  Copied areas stay in this editor until you close it. Text
                  fields use their normal shortcuts.
                </p>
              </details>
            </aside>
          </div>
        ) : (
          <div className="template-editor-layout">
            <section
              className="template-workspace"
              aria-label="Empty template canvas"
            >
              <div className="template-workspace-heading">
                <div>
                  <strong>Your canvas</strong>
                  <span>Import a frame to start editing</span>
                </div>
                <div className="template-view-tabs">
                  <button type="button" disabled>
                    Edit layout
                  </button>
                  <button type="button" disabled>
                    Preview
                  </button>
                </div>
              </div>
              <div
                className="template-editor-toolbar"
                aria-label="Editor tools"
              >
                <div className="template-tool-buttons">
                  <button
                    type="button"
                    disabled
                    className="template-mode-icon"
                    aria-label="Select photo areas"
                    title="Select photo areas (V)"
                  >
                    <EditorToolIcon tool="select" />
                  </button>
                  <button
                    type="button"
                    disabled
                    className="template-mode-icon"
                    aria-label="Draw photo area"
                    title="Draw photo area (R)"
                  >
                    <EditorToolIcon tool="draw" />
                  </button>
                  <button
                    type="button"
                    disabled
                    className="template-mode-icon"
                    aria-label="Pan canvas"
                    title="Pan canvas (H)"
                  >
                    <EditorToolIcon tool="pan" />
                  </button>
                </div>
                <div className="template-zoom-controls">
                  <button type="button" disabled>
                    Fit
                  </button>
                </div>
              </div>
              <p className="template-navigation-hint">
                Your frame will appear here. The canvas fits its size
                automatically.
              </p>
              <div className="template-viewport template-blank-viewport">
                <div className="template-blank-sheet">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8" cy="8" r="1.5" />
                    <path d="m3 17 6-6 4 4 3-3 5 5" />
                  </svg>
                  <h3>Start with your frame</h3>
                  <p>Import a PNG or JPEG design to make it your own.</p>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => frameInput.current?.click()}
                  >
                    {busy ? 'Reading image…' : 'Import frame'}
                  </button>
                </div>
              </div>
              <p className="template-draw-hint">
                Transparent openings or white photo boxes can be detected
                automatically.
              </p>
            </section>
            <aside className="template-controls">
              <div className="template-inspector-heading">
                <strong>Frame details</strong>
                <span>Your frame settings will appear here.</span>
              </div>
              <label>
                Template name
                <input disabled placeholder="Import a frame to begin" />
              </label>
              <div className="template-start-guide">
                <h3>Three steps to your template</h3>
                <ol>
                  <li>
                    <strong>Import your frame</strong>
                    <span>Choose your PNG or JPEG artwork.</span>
                  </li>
                  <li>
                    <strong>Place your photo areas</strong>
                    <span>
                      Adjust the detected areas or draw 4 openings. Move,
                      resize, and tilt them.
                    </span>
                  </li>
                  <li>
                    <strong>Preview and save</strong>
                    <span>
                      Check the sample photos, then save your template for
                      future sessions.
                    </span>
                  </li>
                </ol>
              </div>
            </aside>
          </div>
        )}
        <footer className="template-dialog-footer">
          <span>
            {!draft
              ? 'Start by importing a PNG or JPEG frame.'
              : draft.slots.length !== 4
                ? 'Mark 4 photo areas before saving.'
                : `${draft.slots.length} photo areas · Ready to save on this computer`}
          </span>
          <button
            className="primary-button"
            disabled={
              !draft ||
              busy ||
              saving ||
              !!history.pending ||
              draft.slots.length !== 4
            }
            onClick={() => void save()}
          >
            {saving
              ? 'Saving template…'
              : initialTemplate
                ? 'Save changes'
                : 'Save & use template'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
