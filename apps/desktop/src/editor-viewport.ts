export const MIN_EDITOR_ZOOM = 0.5;
export const MAX_EDITOR_ZOOM = 4;

export function clampEditorZoom(zoom: number) {
  return Math.max(MIN_EDITOR_ZOOM, Math.min(MAX_EDITOR_ZOOM, zoom));
}

export function fitEditorFrame(
  width: number,
  height: number,
  viewWidth: number,
  viewHeight: number,
) {
  const scale = Math.min(
    Math.max(1, viewWidth - 48) / width,
    Math.max(1, viewHeight - 48) / height,
  );
  return { width: width * scale, height: height * scale };
}

// Scroll by the change in position of the same image point after zooming.
export function zoomAnchorOffset(
  origin: number,
  size: number,
  fraction: number,
  target: number,
) {
  return origin + size * fraction - target;
}
