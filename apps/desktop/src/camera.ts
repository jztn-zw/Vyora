export function isTestCamera(label: string) {
  return /^fake_device_\d+$/i.test(label);
}

export const CAMERA_KEY = 'vyora.camera';
export interface CameraPreference {
  deviceId: string;
  label: string;
}

export function readCamera(
  storage: Pick<Storage, 'getItem'>,
): CameraPreference | null {
  try {
    const value = JSON.parse(storage.getItem(CAMERA_KEY) || 'null');
    if (
      value &&
      typeof value.deviceId === 'string' &&
      value.deviceId &&
      typeof value.label === 'string' &&
      !isTestCamera(value.label)
    ) {
      return { deviceId: value.deviceId, label: value.label };
    }
  } catch {
    /* Camera access still works without preference storage. */
  }
  return null;
}

export function saveCamera(
  storage: Pick<Storage, 'setItem'>,
  camera: CameraPreference,
) {
  try {
    storage.setItem(CAMERA_KEY, JSON.stringify(camera));
  } catch {
    /* Keep the selection for this window. */
  }
}

export function resolveCameraId(
  devices: Pick<MediaDeviceInfo, 'deviceId' | 'label'>[],
  saved: CameraPreference | null,
) {
  const available = devices.filter((device) => !isTestCamera(device.label));
  if (!saved) return preferredCameraId(available);
  if (available.some((device) => device.deviceId === saved.deviceId))
    return saved.deviceId;
  // Drivers can assign a new ID after reconnecting. Only accept a unique name match.
  const normalize = (label: string) => label.trim().toLowerCase();
  const matches = saved.label
    ? available.filter(
        (device) => normalize(device.label) === normalize(saved.label),
      )
    : [];
  return matches.length === 1 ? matches[0].deviceId : saved.deviceId;
}

export function preferredCameraId(
  devices: Pick<MediaDeviceInfo, 'deviceId' | 'label'>[],
) {
  const available = devices.filter((device) => !isTestCamera(device.label));
  return (
    (
      available.find(
        (device) =>
          /webcam|integrated|built[- ]?in|usb camera|hd camera/i.test(
            device.label,
          ) && !/virtual|\bobs\b/i.test(device.label),
      ) ?? available[0]
    )?.deviceId ?? ''
  );
}

export function cameraErrorMessage(cause: unknown) {
  const name = cause instanceof Error ? cause.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow desktop apps to access your camera in Windows Settings, then try again.';
    case 'NotFoundError':
      return 'Selected camera not found. Connect a camera, then select Refresh or choose another source. For iPhone, open Camo on your phone and PC.';
    case 'NotReadableError':
    case 'AbortError':
      return 'This camera is unavailable. Close other apps using it, then try again or choose another camera.';
    case 'OverconstrainedError':
      return 'The selected camera is unavailable. Reconnect it or choose another source. For iPhone, check the connection in Camo Studio.';
    case 'TimeoutError':
      return 'The camera did not send a preview in time. Check its connection, open Camo if using iPhone, then select Reconnect.';
    default:
      return cause instanceof Error && cause.message === 'Test camera detected'
        ? 'A test camera was detected. Close this window and reopen VYORA to use your webcam.'
        : 'Could not connect to your camera. Check its connection and try again.';
  }
}

export async function openCamera(
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>,
  deviceId = '',
  signal?: AbortSignal,
) {
  const media = await new Promise<MediaStream>((resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException('Camera connection cancelled', 'AbortError'));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    void mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(
        (value) => {
          signal?.removeEventListener('abort', onAbort);
          if (signal?.aborted)
            value.getTracks().forEach((track) => track.stop());
          else resolve(value);
        },
        (cause: unknown) => {
          signal?.removeEventListener('abort', onAbort);
          reject(cause);
        },
      );
  });
  if (media.getVideoTracks().some((track) => isTestCamera(track.label))) {
    media.getTracks().forEach((track) => track.stop());
    throw new Error('Test camera detected');
  }
  return media;
}
