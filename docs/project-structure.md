# Project folders

Run npm commands from the VYORA repository root. One root `package-lock.json`
manages all npm workspaces; do not create separate lockfiles inside the apps.

```text
VYORA/
  apps/
    desktop/              Electron Windows application
      src/                Capture, editor, local library, printing and guest displays
    client/               React + Vite website
      src/                Website UI and guest gallery viewer starter
      vite.config.ts      Local /api proxy
    server/               Node.js + TypeScript website API
      src/app.ts          HTTP server and starter health route
      src/index.ts        Configuration, startup and shutdown
      .env.example        Optional local configuration
  packages/
    shared/               Shared TypeScript contracts and VYORA brand assets
  docs/                   Setup and architecture documentation
  package.json            Workspace commands
  package-lock.json       Dependency lockfile
```

## Local development

After moving or cloning the project, run `npm ci` once at the root. It installs
dependencies for all workspaces. Start each app you need in its own terminal:

| Command               | Purpose                        | Local address                      |
| --------------------- | ------------------------------ | ---------------------------------- |
| `npm run dev:desktop` | Start the Electron desktop app | Native window                      |
| `npm run dev:client`  | Start the website client       | `http://127.0.0.1:5174`            |
| `npm run dev:server`  | Start the website API          | `http://127.0.0.1:8787/api/health` |

`npm run dev` remains the desktop shortcut. `dev:viewer` and `build:viewer` remain
compatibility aliases for the client commands. The client was moved from
`apps/viewer` to `apps/client`; its existing page and theme are preserved.

The API runs without a database or cloud account. It currently serves only its
health route. The website's existing gallery setup page remains a starter;
uploads, event galleries, accounts, share links and QR codes need implementation.

The client sends future API requests to relative `/api/...` paths. Vite forwards
these to `127.0.0.1:8787` during development. If you change the API port, update the
proxy target in `apps/client/vite.config.ts` too. Production hosting will need its
own `/api` routing to the server; the development proxy is not a deployed service.

To override the server's local host or port, copy `apps/server/.env.example` to
`apps/server/.env`. Private database credentials and storage keys belong on the
server, never in client code or the distributed desktop app.

## Build and run

- `npm run build:client` produces `apps/client/dist`.
- `npm run build:server` produces `apps/server/dist`.
- `npm run start:server` runs the compiled API after building it.
- `npm run make:desktop` creates the existing Windows installer.
- `npm run typecheck` checks all workspaces; `npm run lint` checks source code.

The website server is independent from Electron's local guest-device server.
Desktop capture and local saving continue to work without the website API.
No desktop library files or user photos were moved into the website folders.
