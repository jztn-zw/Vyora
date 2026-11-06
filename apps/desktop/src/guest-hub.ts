import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GuestCommand, GuestSnapshot } from '@vyora/shared';
import { isPhotoEffect } from './photo-effects.ts';

export function parseGuestCommand(input: unknown): GuestCommand {
  const value = input as GuestCommand;
  if (
    !value ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    ![
      'frame',
      'design',
      'start',
      'continue',
      'retake',
      'confirm',
      'next',
      'effect',
    ].includes(value.action) ||
    (value.action === 'effect' && !isPhotoEffect(value.effect)) ||
    (value.action === 'frame' &&
      (typeof value.frameId !== 'string' || value.frameId.length > 200)) ||
    (value.action === 'retake' &&
      (!Array.isArray(value.photoIds) ||
        !value.photoIds.length ||
        value.photoIds.length > 4 ||
        new Set(value.photoIds).size !== value.photoIds.length ||
        value.photoIds.some((id) => typeof id !== 'string' || id.length > 100)))
  ) {
    throw new Error('Choose an available booth action.');
  }
  return {
    revision: value.revision,
    action: value.action,
    effect: value.effect,
    frameId: value.frameId,
    photoIds: value.photoIds,
  };
}

export class GuestHub {
  snapshot: GuestSnapshot | null = null;
  preview = Buffer.alloc(0);
  private server?: Server;
  private port = 0;
  private code = '';
  private codeExpires = 0;
  private devices = new Map<
    string,
    { id: string; name: string; approved: boolean; seen: number }
  >();
  private attempts = new Map<string, { count: number; since: number }>();
  private addresses: string[] = [];
  private commandBusy = false;
  private consumedRevision = -1;
  private published = '';
  private hostSeen = 0;
  private tabletState: GuestSnapshot | null = null;
  private images = new Map<
    string,
    { source: string; type: string; data: Buffer }
  >();
  private directory: string;
  private command: (value: GuestCommand) => Promise<void>;
  constructor(
    directory: string,
    command: (value: GuestCommand) => Promise<void>,
  ) {
    this.directory = directory;
    this.command = command;
  }
  publish(value: GuestSnapshot) {
    // The controller is trusted; still bound memory and validate its image payloads.
    const encoded = JSON.stringify(value);
    if (encoded.length > 24 * 1024 * 1024)
      throw new Error(
        'Too many large frames for the guest display. Select fewer frames.',
      );
    if (encoded === this.published) {
      this.hostSeen = Date.now();
      return;
    }
    const nextState = {
      ...value,
      revision: (this.snapshot?.revision ?? 0) + 1,
    };
    const nextImages = new Map<
      string,
      { source: string; type: string; data: Buffer }
    >();
    const image = (source: string) => {
      if (!source) return '';
      const hash = createHash('sha256').update(source).digest('hex');
      let cached = this.images.get(hash);
      if (!cached) {
        const match =
          /^data:(image\/(?:jpeg|png|webp|svg\+xml))((?:;charset=utf-8)?)(;base64)?,(.*)$/s.exec(
            source,
          );
        if (!match) throw new Error('Invalid guest image.');
        cached = {
          source,
          type: match[1],
          data: match[3]
            ? Buffer.from(match[4], 'base64')
            : Buffer.from(decodeURIComponent(match[4])),
        };
      }
      nextImages.set(hash, cached);
      return `/api/image/${hash}`;
    };
    const nextTabletState = {
      ...nextState,
      frames: value.frames.map((frame) => ({
        ...frame,
        preview: image(frame.preview),
      })),
      photos: value.photos.map((photo) => ({
        ...photo,
        thumbnail: image(photo.thumbnail),
      })),
      strip: image(value.strip),
    };
    this.hostSeen = Date.now();
    this.published = encoded;
    this.snapshot = nextState;
    this.tabletState = nextTabletState;
    this.images = nextImages;
  }
  state() {
    return Date.now() - this.hostSeen < 6000 && this.snapshot
      ? { ...this.snapshot, hostTime: Date.now() }
      : null;
  }
  controllerOffline() {
    this.hostSeen = 0;
    this.published = '';
    this.preview = Buffer.alloc(0);
  }
  async dispatch(input: unknown) {
    const value = parseGuestCommand(input);
    const state = this.state();
    if (!state || state.mode !== 'self-service' || state.paused || state.busy)
      throw new Error('Please wait for the organizer.');
    if (
      value.revision !== state.revision ||
      value.revision === this.consumedRevision
    )
      throw new Error(
        'The booth has moved to the next step. Please try again.',
      );
    if (this.commandBusy)
      throw new Error('The booth is processing another action. Please wait.');
    const allowed =
      value.action === 'frame'
        ? state.stage === 'design' &&
          state.frames.some((f) => f.id === value.frameId)
        : value.action === 'design'
          ? state.stage === 'ready'
          : value.action === 'start'
            ? state.stage === 'ready' && state.ready
            : value.action === 'retake'
              ? state.stage === 'review' &&
                state.ready &&
                value.photoIds!.every((id) =>
                  state.photos.some((p) => p.id === id),
                )
              : value.action === 'effect'
                ? state.stage === 'review' &&
                  value.effect !== (state.effect ?? 'original')
                : value.action === 'continue'
                  ? state.stage === 'review' &&
                    state.ready &&
                    state.photos.length < state.total
                  : value.action === 'confirm'
                    ? state.stage === 'review' &&
                      state.photos.length === state.total
                    : state.stage === 'done';
    if (!allowed) throw new Error('This action is not available at this step.');
    this.commandBusy = true;
    this.consumedRevision = value.revision;
    try {
      await this.command(value);
    } catch (error) {
      this.consumedRevision = -1;
      throw error;
    } finally {
      this.commandBusy = false;
    }
  }
  status() {
    return {
      tablet: !!this.server,
      urls: this.server
        ? this.addresses
            .filter((ip) => ip !== '127.0.0.1')
            .map(
              (ip) => `http://${ip}:${this.port}/guest.html#pair=${this.code}`,
            )
        : [],
      pairingCode: this.code,
      devices: [...this.devices.values()].map(
        ({ id, name, approved, seen }) => ({
          id,
          name,
          approved,
          connected: Date.now() - seen < 6000,
        }),
      ),
    };
  }
  approve(id: string) {
    const device = [...this.devices.values()].find((d) => d.id === id);
    if (device) device.approved = true;
  }
  revoke(id: string) {
    for (const [token, device] of this.devices)
      if (device.id === id) this.devices.delete(token);
  }
  async start() {
    if (this.server) return;
    try {
      await readFile(path.join(this.directory, 'guest.html'));
    } catch {
      throw new Error(
        'The guest screen is not built yet. Build VYORA before enabling device access.',
      );
    }
    this.code = String(randomInt(100000, 1000000));
    this.codeExpires = Date.now() + 10 * 60_000;
    this.addresses = [
      '127.0.0.1',
      ...Object.values(networkInterfaces())
        .flat()
        .filter((item) => item && item.family === 'IPv4' && !item.internal)
        .map((item) => item!.address),
    ];
    const server = createServer((req, res) => {
      void this.request(req, res).catch(() => {
        if (!res.headersSent)
          this.json(res, 500, {
            error: 'Guest display could not complete the request.',
          });
        else res.end();
      });
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '0.0.0.0', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Could not open device connection.');
      this.port = address.port;
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  stop() {
    this.server?.close();
    this.server?.closeAllConnections();
    this.server = undefined;
    this.devices.clear();
    this.attempts.clear();
    this.code = '';
    this.port = 0;
  }
  dispose() {
    this.stop();
    this.preview = Buffer.alloc(0);
    this.snapshot = null;
    this.tabletState = null;
    this.images.clear();
  }
  private json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
  private async body(req: IncomingMessage) {
    let body = '';
    for await (const part of req) {
      body += part;
      if (body.length > 4096) throw new Error('Request is too large.');
    }
    return JSON.parse(body);
  }
  private async request(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const host = req.headers.host ?? '';
    if (!this.addresses.some((ip) => host === `${ip}:${this.port}`))
      return this.json(res, 403, { error: 'Invalid guest address.' });
    if (req.method === 'POST' && req.headers.origin !== `http://${host}`)
      return this.json(res, 403, {
        error: 'Open this page directly from the pairing link.',
      });
    const url = new URL(req.url || '/', `http://${host}`);
    if (req.method === 'POST' && url.pathname === '/api/pair') {
      const ip = req.socket.remoteAddress || '';
      let attempt = this.attempts.get(ip);
      if (!attempt || Date.now() - attempt.since > 60000) {
        attempt = { since: Date.now(), count: 0 };
        if (this.attempts.size > 100) this.attempts.clear();
        this.attempts.set(ip, attempt);
      }
      if (++attempt.count > 8)
        return this.json(res, 429, {
          error: 'Too many attempts. Wait one minute before pairing again.',
        });
      const input = await this.body(req);
      if (
        Date.now() > this.codeExpires ||
        input.code !== this.code ||
        this.devices.size >= 8
      )
        return this.json(res, 403, {
          error:
            'Pairing expired or unavailable. Ask the organizer to restart device pairing.',
        });
      const token = randomBytes(32).toString('hex');
      this.devices.set(token, {
        id: randomBytes(8).toString('hex'),
        name: String(input.name || 'Guest device').slice(0, 60),
        approved: false,
        seen: Date.now(),
      });
      res.setHeader(
        'Set-Cookie',
        `vyoraGuest=${token}; HttpOnly; SameSite=Strict; Path=/`,
      );
      return this.json(res, 200, { paired: true });
    }
    if (url.pathname.startsWith('/api/')) {
      const token = req.headers.cookie
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('vyoraGuest='))
        ?.slice(11);
      const device = token ? this.devices.get(token) : undefined;
      if (!device)
        return this.json(res, 401, {
          error: 'Pair this device with VYORA again.',
        });
      device.seen = Date.now();
      if (!device.approved)
        return this.json(res, 403, {
          error: 'Waiting for the organizer to approve this device.',
        });
      if (req.method === 'GET' && url.pathname === '/api/state') {
        if (
          this.state() &&
          url.searchParams.get('since') === String(this.snapshot!.revision)
        ) {
          res.writeHead(304);
          return res.end();
        }
        return this.json(
          res,
          200,
          this.state() && this.tabletState
            ? { ...this.tabletState, hostTime: Date.now() }
            : null,
        );
      }
      if (
        req.method === 'GET' &&
        /^\/api\/image\/[a-f0-9]{64}$/.test(url.pathname)
      ) {
        const image = this.images.get(url.pathname.slice('/api/image/'.length));
        if (!image)
          return this.json(res, 404, {
            error: 'This photo is no longer part of the current session.',
          });
        res.writeHead(200, {
          'Content-Type': image.type,
          'Cache-Control': 'private, max-age=30',
        });
        return res.end(image.data);
      }
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        return res.end(this.preview);
      }
      if (req.method === 'POST' && url.pathname === '/api/command') {
        try {
          await this.dispatch(await this.body(req));
          return this.json(res, 200, { ok: true });
        } catch (error) {
          return this.json(res, 409, {
            error: error instanceof Error ? error.message : 'Please try again.',
          });
        }
      }
      return this.json(res, 404, { error: 'Not available.' });
    }
    if (
      req.method !== 'GET' ||
      !(
        url.pathname === '/guest.html' ||
        /^\/assets\/[\w.-]+$/.test(url.pathname)
      )
    )
      return this.json(res, 404, { error: 'Not available.' });
    const filename = path.join(this.directory, url.pathname.slice(1));
    try {
      const contents = await readFile(filename);
      const type = filename.endsWith('.html')
        ? 'text/html'
        : filename.endsWith('.js')
          ? 'application/javascript'
          : filename.endsWith('.css')
            ? 'text/css'
            : filename.endsWith('.png')
              ? 'image/png'
              : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(contents);
    } catch {
      this.json(res, 404, {
        error: 'Guest screen assets are unavailable. Rebuild VYORA.',
      });
    }
  }
}
