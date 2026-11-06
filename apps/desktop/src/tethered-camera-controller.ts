import { CameraController } from './camera-controller';
import type { DesktopApi } from '@vyora/shared';
type Bridge = Pick<
  DesktopApi,
  'connectTetheredCamera' | 'readTetheredPreview' | 'captureTetheredPhoto'
>;
export type CaptureSource = 'webcam' | 'tethered';
export class TetheredCameraController extends CameraController {
  source: CaptureSource = 'webcam';
  port = 5513;
  recoveryMs = 2000;
  private generation = 0;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private nextFrame?: ReturnType<typeof setTimeout>;
  private serial = '';
  private lastFrame = 0;
  private nativeBusy = false;
  private recoverAt = 0;
  private bridge: Bridge;
  constructor(
    ...[devices, preview, storage, onInterrupted, bridge]: [
      ...ConstructorParameters<typeof CameraController>,
      Bridge,
    ]
  ) {
    super(devices, preview, storage, onInterrupted);
    this.bridge = bridge;
  }
  setSource(source: CaptureSource) {
    this.off();
    this.source = source;
    this.update({
      devices: [],
      deviceId: '',
      cameraLabel: '',
      cameraResolution: '',
    });
  }
  override async refresh() {
    if (this.source === 'webcam') return super.refresh();
    this.update({ scanning: false });
  }
  override async connect(selectedId?: string) {
    if (this.source === 'webcam') return super.connect(selectedId);
    this.off();
    const generation = this.generation;
    this.update({ status: 'connecting', cameraError: '', scanning: false });
    try {
      const result = await this.bridge.connectTetheredCamera(this.port);
      if (generation !== this.generation) return;
      if (!result.ok) throw new Error(result.error);
      this.serial = result.value.serial;
      this.canvas = document.createElement('canvas');
      await this.paint(generation);
      if (generation !== this.generation) return;
      this.stream = this.canvas.captureStream(12);
      const video = this.preview();
      if (!video) throw new Error('Camera preview is unavailable.');
      video.srcObject = this.stream;
      await this.paint(generation);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          video.play(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    'Camera preview did not start. Check live view in digiCamControl.',
                  ),
                ),
              12000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      if (generation !== this.generation) return;
      this.update({
        status: 'ready',
        cameraLabel: result.value.name,
        deviceId: this.serial,
        devices: [
          {
            deviceId: this.serial,
            label: result.value.name,
            groupId: '',
            kind: 'videoinput',
            toJSON: () => ({}),
          } as MediaDeviceInfo,
        ],
      });
      void this.poll(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stopPreview();
      const video = this.preview();
      if (video) video.srcObject = null;
      this.update({
        status: 'error',
        cameraError:
          error instanceof Error
            ? error.message
            : 'Could not connect the tethered camera.',
      });
    }
  }
  private async paint(generation: number) {
    const result = await this.bridge.readTetheredPreview(this.port);
    if (!result.ok) throw new Error(result.error);
    if (generation !== this.generation || !this.canvas) return;
    const bitmap = await createImageBitmap(
      new Blob([result.value], { type: 'image/jpeg' }),
    );
    try {
      if (generation !== this.generation || !this.canvas) return;
      const width = Math.min(bitmap.width, 1280),
        height = Math.round((bitmap.height * width) / bitmap.width);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
      this.lastFrame = Date.now();
      const cameraResolution = `${width} × ${height} preview · native stills`;
      if (this.state.cameraResolution !== cameraResolution)
        this.update({ cameraResolution });
    } finally {
      bitmap.close();
    }
  }
  private async poll(generation: number) {
    if (generation !== this.generation) return;
    try {
      await this.paint(generation);
      if (generation === this.generation && this.state.status === 'paused')
        this.update({ status: 'ready', cameraError: '' });
    } catch {
      // Cameras commonly suspend live view during a real exposure/transfer.
      if (
        generation === this.generation &&
        !this.nativeBusy &&
        Date.now() - this.lastFrame > 8000
      ) {
        const interrupted = this.state.status !== 'paused';
        this.update({
          status: 'paused',
          cameraError:
            'Camera preview interrupted. Check the USB connection and digiCamControl.',
        });
        if (interrupted) this.onInterrupted();
      }
    }
    if (generation === this.generation)
      this.nextFrame = setTimeout(() => void this.poll(generation), 150);
  }
  override canCapture() {
    if (this.source === 'webcam') return super.canCapture();
    const video = this.preview();
    return (
      this.state.status === 'ready' &&
      !!this.stream &&
      !!video &&
      video.readyState >= 2 &&
      Date.now() - this.lastFrame < 8000 &&
      !this.nativeBusy
    );
  }
  remainingRecovery() {
    return this.source === 'tethered'
      ? Math.max(0, this.recoverAt - Date.now())
      : 0;
  }
  async captureNative(signal: AbortSignal) {
    if (this.source !== 'tethered' || !this.canCapture())
      throw new Error('Reconnect the tethered camera before taking a photo.');
    const generation = this.generation;
    this.nativeBusy = true;
    let requested = false;
    let transferred = false;
    let rejected = false;
    try {
      signal.throwIfAborted();
      requested = true;
      const result = await this.bridge.captureTetheredPhoto(
        this.port,
        this.serial,
        crypto.randomUUID(),
        this.recoveryMs,
      );
      transferred = true;
      if (!result.ok) {
        rejected = true;
        throw new Error(result.error);
      }
      this.recoverAt = Date.now() + this.recoveryMs;
      signal.throwIfAborted();
      if (generation !== this.generation)
        throw new Error('Camera connection changed during capture.');
      this.lastFrame = Date.now();
      return result.value;
    } catch (error) {
      if (
        (!signal.aborted || rejected || (requested && !transferred)) &&
        generation === this.generation
      ) {
        this.off();
        this.update({
          status: 'error',
          cameraError:
            error instanceof Error
              ? error.message
              : 'Check the camera before reconnecting.',
        });
      }
      throw error;
    } finally {
      this.nativeBusy = false;
    }
  }
  private stopPreview() {
    clearTimeout(this.nextFrame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
  }
  override off() {
    this.generation++;
    this.stopPreview();
    this.serial = '';
    super.off();
  }
  override dispose() {
    this.off();
    super.dispose();
  }
}
