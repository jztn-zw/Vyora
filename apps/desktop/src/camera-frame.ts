const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const BLACK_LEVEL = 12;

export function findCameraSideBands({ data, width, height }: ImageData) {
  const limit = Math.floor(width / 4);
  const minimum = Math.max(2, Math.ceil(width * 0.03));
  const allowedColor = Math.floor(height * 0.02);

  function blackColumns(start: number, direction: number) {
    let count = 0;
    for (; count < limit; count++) {
      const x = start + count * direction;
      let colored = 0;
      for (let y = 0; y < height; y++) {
        const offset = (y * width + x) * 4;
        if (
          Math.max(data[offset], data[offset + 1], data[offset + 2]) >
          BLACK_LEVEL
        )
          colored++;
        if (colored > allowedColor) break;
      }
      if (colored > allowedColor) break;
    }
    return count;
  }

  const left = blackColumns(0, 1);
  if (left < minimum || left === limit) return null;
  const right = blackColumns(width - 1, -1);
  // Both edges must agree. A dark edge in the scene alone is not padding.
  if (right < minimum || right === limit || Math.abs(left - right) > 2)
    return null;
  return { left, right };
}

export function createCameraFrameCropper() {
  const sample = new OffscreenCanvas(SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const context = sample.getContext('2d', { willReadFrequently: true });

  return (video: HTMLVideoElement) => {
    if (!context) return null;
    const width = Math.min(video.videoWidth, SAMPLE_WIDTH);
    const height = Math.min(video.videoHeight, SAMPLE_HEIGHT);
    context.drawImage(video, 0, 0, width, height);
    const bands = findCameraSideBands(
      context.getImageData(0, 0, width, height),
    );
    if (!bands) return null;
    const scale = video.videoWidth / width;
    const x = Math.round(bands.left * scale);
    const right = Math.round(bands.right * scale);
    return { x, width: video.videoWidth - x - right };
  };
}
