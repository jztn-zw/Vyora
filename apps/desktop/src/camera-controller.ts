import {
  cameraErrorMessage,
  isTestCamera,
  openCamera,
  readCamera,
  resolveCameraId,
  saveCamera,
} from './camera.ts';
import type { CameraPreference } from './camera.ts';

export interface CameraState {
  devices: MediaDeviceInfo[];
  deviceId: string;
  cameraLabel: string;
  cameraResolution: string;
  cameraError: string;
  scanning: boolean;
  status: 'off' | 'connecting' | 'ready' | 'paused' | 'disconnected' | 'error';
}

type CameraStorage = Pick<Storage, 'getItem' | 'setItem'>;

function untilAborted<T>(pending: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (cause: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(cause);
      },
    );
  });
}

// Owns device/preview lifetimes independently of React so connection races and
// driver interruptions can be tested without a webcam or photo library.
export class CameraController {
  state: CameraState;
  private preferred: CameraPreference | null;
  private media: MediaStream | null = null;
  private attempt: AbortController | null = null;
  private scan = 0;
  private disposed = false;
  private cleanListeners = () => {};
  private notify = (_state: CameraState) => {};
  private readonly devices: Pick<
    MediaDevices,
    'getUserMedia' | 'enumerateDevices'
  >;
  protected readonly preview: () => HTMLVideoElement | null;
  private readonly storage: CameraStorage;
  protected readonly onInterrupted: () => void;

  constructor(
    devices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>,
    preview: () => HTMLVideoElement | null,
    storage: CameraStorage,
    onInterrupted: () => void,
  ) {
    this.devices = devices;
    this.preview = preview;
    this.storage = storage;
    this.onInterrupted = onInterrupted;
    this.preferred = readCamera(storage);
    this.state = {
      devices: [],
      deviceId: this.preferred?.deviceId || '',
      cameraLabel: this.preferred?.label || '',
      cameraResolution: '',
      cameraError: '',
      scanning: false,
      status: 'off',
    };
  }

  subscribe(listener: (state: CameraState) => void) {
    this.notify = listener;
    listener(this.state);
    return () => {
      this.notify = () => {};
    };
  }

  protected update(patch: Partial<CameraState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }

  async refresh() {
    const scan = ++this.scan;
    this.update({ scanning: true });
    try {
      const all = await this.devices.enumerateDevices();
      if (this.disposed || scan !== this.scan) return;
      const cameras = all.filter(
        (device) => device.kind === 'videoinput' && !isTestCamera(device.label),
      );
      this.update({
        devices: cameras,
        ...(this.media
          ? {}
          : { deviceId: resolveCameraId(cameras, this.preferred) }),
      });
      const track = this.media?.getVideoTracks()[0];
      if (track?.readyState === 'ended') this.interrupt(true);
    } catch (cause) {
      if (scan === this.scan && !this.media)
        this.update({ cameraError: cameraErrorMessage(cause) });
    } finally {
      if (scan === this.scan) this.update({ scanning: false });
    }
  }

  private release() {
    this.cleanListeners();
    this.cleanListeners = () => {};
    this.media?.getTracks().forEach((track) => track.stop());
    this.media = null;
    const video = this.preview();
    if (video) video.srcObject = null;
  }

  private interrupt(ended = false) {
    if (!this.media) return;
    if (this.state.status === 'connecting') {
      this.attempt?.abort(
        new DOMException('Camera preview interrupted', 'NotReadableError'),
      );
      return;
    }
    const wasReady = this.state.status === 'ready';
    if (ended) this.release();
    this.update({
      status: ended ? 'disconnected' : 'paused',
      cameraError: ended
        ? 'Camera disconnected. Reconnect it, then select Reconnect. For iPhone, confirm the preview in Camo Studio first.'
        : 'Camera feed paused. Check your camera or Camo connection. Capture is paused until the live preview returns.',
    });
    if (wasReady) this.onInterrupted();
  }

  canCapture() {
    const track = this.media?.getVideoTracks()[0];
    const video = this.preview();
    return (
      this.state.status === 'ready' &&
      !!track &&
      track.readyState === 'live' &&
      track.enabled &&
      !track.muted &&
      !!video &&
      video.srcObject === this.media &&
      !video.paused &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  }

  async connect(selectedId?: string) {
    if (this.disposed) return;
    this.attempt?.abort();
    const attempt = new AbortController();
    this.attempt = attempt;
    this.release();
    if (selectedId)
      this.preferred = {
        deviceId: selectedId,
        label:
          this.state.devices.find((device) => device.deviceId === selectedId)
            ?.label || '',
      };
    this.update({
      status: 'connecting',
      cameraLabel: this.preferred?.label || '',
      cameraError: '',
      cameraResolution: '',
    });
    const timeout = setTimeout(
      () => attempt.abort(new DOMException('Camera timed out', 'TimeoutError')),
      15000,
    );
    let media: MediaStream | undefined;
    try {
      // Refresh before matching saved names: Windows may have assigned a new ID.
      await untilAborted(this.refresh(), attempt.signal);
      attempt.signal.throwIfAborted();
      if (this.disposed) return;
      const id =
        selectedId ?? resolveCameraId(this.state.devices, this.preferred);
      this.update({ deviceId: id });
      media = await openCamera(this.devices, id, attempt.signal);
      if (this.disposed) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      attempt.signal.throwIfAborted();
      const track = media.getVideoTracks()[0];
      const video = this.preview();
      if (!track || track.readyState !== 'live')
        throw new DOMException('No live camera', 'NotReadableError');
      if (!video) throw new Error('Camera preview is unavailable');
      this.media = media;
      // Loading a new srcObject normally emits waiting. Only interrupt once
      // this stream has supplied its first playable preview.
      const pause = () => {
        if (this.state.status !== 'connecting') this.interrupt();
      };
      const ended = () => this.interrupt(true);
      const resume = () => {
        if (
          this.media !== media ||
          this.state.status !== 'paused' ||
          track.muted ||
          track.readyState !== 'live' ||
          video.readyState < 2 ||
          video.paused ||
          !video.videoWidth ||
          !video.videoHeight
        )
          return;
        this.update({ status: 'ready', cameraError: '' });
      };
      const resize = () =>
        this.update({
          cameraResolution: `${video.videoWidth} × ${video.videoHeight}`,
        });
      track.addEventListener('ended', ended);
      track.addEventListener('mute', pause);
      track.addEventListener('unmute', resume);
      video.addEventListener('waiting', pause);
      video.addEventListener('error', ended);
      video.addEventListener('playing', resume);
      video.addEventListener('resize', resize);
      this.cleanListeners = () => {
        track.removeEventListener('ended', ended);
        track.removeEventListener('mute', pause);
        track.removeEventListener('unmute', resume);
        video.removeEventListener('waiting', pause);
        video.removeEventListener('error', ended);
        video.removeEventListener('playing', resume);
        video.removeEventListener('resize', resize);
      };
      video.srcObject = media;
      await untilAborted(video.play(), attempt.signal);
      attempt.signal.throwIfAborted();
      if (this.disposed || this.media !== media) return;
      if (
        track.readyState !== 'live' ||
        !track.enabled ||
        track.muted ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        throw new DOMException('No camera frames', 'NotReadableError');
      const settings = track.getSettings();
      this.preferred = {
        deviceId: settings.deviceId || id,
        label: track.label || '',
      };
      saveCamera(this.storage, this.preferred);
      this.update({
        status: 'ready',
        deviceId: this.preferred.deviceId,
        cameraLabel: track.label || 'Connected camera',
        cameraError: '',
        cameraResolution: `${video.videoWidth} × ${video.videoHeight}`,
      });
      void this.refresh();
    } catch (cause) {
      media?.getTracks().forEach((track) => track.stop());
      if (this.attempt !== attempt || this.disposed) return;
      this.release();
      this.scan++;
      this.update({
        status: 'error',
        scanning: false,
        cameraError: cameraErrorMessage(
          attempt.signal.aborted ? attempt.signal.reason : cause,
        ),
      });
    } finally {
      clearTimeout(timeout);
      if (this.attempt === attempt) this.attempt = null;
    }
  }

  off() {
    this.attempt?.abort();
    this.attempt = null;
    this.release();
    this.scan++;
    this.update({
      status: 'off',
      scanning: false,
      cameraError: '',
      cameraResolution: '',
    });
  }

  dispose() {
    this.off();
    this.disposed = true;
    this.scan++;
    this.notify = () => {};
  }
}
