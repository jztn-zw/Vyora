import { randomUUID } from 'node:crypto';

export interface TetheredCameraInfo {
  serial: string;
  name: string;
}
const LIMIT = 20 * 1024 * 1024;

/** Only the documented local digiCamControl HTTP API is reachable from this adapter. */
export class DigiCamBridge {
  private inFlight = false;
  private connecting = false;
  private uncertain = false;
  private lastRequest = '';
  private lastResult: Promise<ArrayBuffer> | null = null;
  private currentCamera: TetheredCameraInfo | null = null;
  private connectedPort = 0;
  private usedRequests = new Set<string>();
  private readyAfter = 0;
  private readonly request: typeof fetch;
  constructor(request: typeof fetch = fetch) {
    this.request = request;
  }
  private async read(
    port: number,
    route: string,
    limit: number,
    timeout = 4000,
  ) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('Choose a connector port from 1024 to 65535.');
    const response = await this.request(`http://127.0.0.1:${port}${route}`, {
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        'The camera connector did not respond. Check digiCamControl.',
      );
    }
    if (Number(response.headers.get('content-length') || 0) > limit) {
      await response.body.cancel().catch(() => {});
      throw new Error(
        'The camera image is too large. Use JPEG capture below 20 MB.',
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit)
          throw new Error('The connector response is too large.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const result = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }
    return result;
  }
  private async command(
    port: number,
    command: string,
    parameter: string,
    extra: Record<string, string> = {},
    timeout = 4000,
  ) {
    const query = new URLSearchParams({
      slc: command,
      param1: parameter,
      ...extra,
    });
    let result = new TextDecoder()
      .decode(await this.read(port, `/?${query}`, 65536, timeout))
      .trim();
    try {
      const decoded = JSON.parse(result);
      if (typeof decoded === 'string') result = decoded;
    } catch {
      /* Plain responses are part of the documented API. */
    }
    if (/^(error|exception|fail)/i.test(result))
      throw new Error(
        'The camera rejected the command. Check its focus, JPEG settings and USB connection.',
      );
    return result;
  }
  async info(port: number): Promise<TetheredCameraInfo> {
    const serial = await this.command(port, 'get', 'camera');
    const name = await this.command(port, 'get', 'property.devicename');
    if (
      !serial ||
      serial.length > 200 ||
      /[<>\r\n]/.test(serial) ||
      ['?', '-', 'OK', 'null'].includes(serial) ||
      !name ||
      name.length > 200 ||
      /[<>\r\n]/.test(name)
    )
      throw new Error(
        'Select a supported camera in digiCamControl, then reconnect.',
      );
    return { serial, name };
  }
  async connect(port: number) {
    if (this.inFlight || this.connecting)
      throw new Error(
        'A camera transfer is still running. Wait for it to finish.',
      );
    this.connecting = true;
    this.currentCamera = null;
    try {
      const info = await this.info(port);
      this.currentCamera = info;
      this.connectedPort = port;
      // A deliberate reconnection is required after an uncertain shutter result.
      this.uncertain = false;
      this.lastRequest = '';
      this.lastResult = null;
      this.usedRequests.clear();
      return info;
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof Error && error.name === 'TimeoutError')
      )
        throw new Error(
          'Could not reach digiCamControl on this computer. Open it and enable its web server.',
        );
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  async startPreview(port: number) {
    const query = new URLSearchParams({ CMD: 'LiveViewWnd_Show' });
    await this.read(port, `/?${query}`, 1024 * 1024);
    // The connector can remain running minimized while VYORA shows its live view.
    await this.read(port, '/?CMD=All_Minimize', 1024 * 1024);
  }
  async preview(port: number) {
    const bytes = await this.read(port, '/liveview.jpg', 4 * 1024 * 1024);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
      throw new Error('Start live view in digiCamControl, then reconnect.');
    return bytes.buffer;
  }
  capture(
    port: number,
    serial: string,
    requestId: string,
    recoveryMs: number,
  ): Promise<ArrayBuffer> {
    if (
      !this.currentCamera ||
      this.currentCamera.serial !== serial ||
      this.connectedPort !== port
    )
      return Promise.reject(
        new Error(
          'Reconnect the selected tethered camera before taking a photo.',
        ),
      );
    if (requestId === this.lastRequest && this.lastResult)
      return this.lastResult;
    if (
      !/^[0-9a-f-]{36}$/i.test(requestId) ||
      !Number.isInteger(recoveryMs) ||
      recoveryMs < 0 ||
      recoveryMs > 10000
    )
      return Promise.reject(new Error('Invalid capture settings.'));
    if (this.inFlight || this.uncertain || this.connecting)
      return Promise.reject(
        new Error(
          'The previous shutter result is uncertain or busy. Check the camera before reconnecting.',
        ),
      );
    if (this.usedRequests.has(requestId) || this.usedRequests.size >= 4096)
      return Promise.reject(
        new Error(
          'This capture request has already finished. Reconnect before starting a new session.',
        ),
      );
    this.usedRequests.add(requestId);
    this.inFlight = true;
    this.lastRequest = requestId;
    this.lastResult = this.take(port, serial, recoveryMs).finally(() => {
      this.inFlight = false;
    });
    return this.lastResult;
  }
  private async take(port: number, serial: string, recoveryMs: number) {
    let triggered = false;
    try {
      if (Date.now() < this.readyAfter)
        throw new Error(
          'Wait for the flash recovery interval before starting the next countdown.',
        );
      const current = await this.info(port);
      if (current.serial !== serial)
        throw new Error(
          'The selected camera changed. Reconnect before capturing.',
        );
      const token = `vyora-${randomUUID()}`;
      // One shutter request only. Never retry a timed-out command automatically.
      triggered = true;
      await this.command(port, 'capture', token, { camera: serial }, 15000);
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const returned = await this.command(port, 'get', 'lastcaptured');
        const filename = returned.replaceAll('\\', '/').split('/').pop() || '';
        if (
          [`${token}.jpg`, `${token}.jpeg`].includes(filename.toLowerCase())
        ) {
          const bytes = await this.read(
            port,
            `/image/${encodeURIComponent(filename)}`,
            LIMIT,
            15000,
          );
          if (
            bytes[0] !== 0xff ||
            bytes[1] !== 0xd8 ||
            bytes[bytes.length - 2] !== 0xff ||
            bytes[bytes.length - 1] !== 0xd9
          )
            throw new Error(
              'The camera did not return a complete JPEG. Set the camera to JPEG and check the transfer.',
            );
          const after = await this.info(port);
          if (after.serial !== serial)
            throw new Error(
              'The camera changed during transfer. This photo was not accepted.',
            );
          this.readyAfter = Date.now() + recoveryMs;
          return bytes.buffer;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(
        'The shutter was requested, but its matching JPEG did not arrive. Check the camera before reconnecting; VYORA will not retry the shutter automatically.',
      );
    } catch (error) {
      if (triggered) this.uncertain = true;
      if (
        error instanceof Error &&
        !['TimeoutError', 'TypeError'].includes(error.name)
      )
        throw error;
      throw new Error(
        triggered
          ? 'The camera transfer was interrupted. Check whether a photo was taken before reconnecting.'
          : 'Could not reach digiCamControl on this computer. Open it and enable its web server.',
      );
    }
  }
}
