<h1 align="center">
  <img src="apps/client/src/assets/vyora-emblem.webp" alt="VYORA Photobooth" width="96">
</h1>

<p align="center">
  <strong>VYORA Photobooth</strong><br>
  The public website and setup guide for the offline-first Windows photobooth.
</p>

<p align="center">
  <a href="#about-the-website">About the website</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#project-structure">Project structure</a>
</p>

<p align="center">
  <img src="apps/client/src/assets/vyora-studio-preview.webp" alt="Preview of VYORA Studio" width="880">
</p>

## About the website

The website introduces VYORA, shows its booth and print features, and provides a setup guide. The Windows app is maintained separately. Desktop capture, saving, and printing do not depend on this website or its API.

## Quick start

Use Node.js 22.12 or newer in the 22.x series, or Node.js 24+. From the repository root:

```powershell
npm ci
npm run dev:client
```

Open [127.0.0.1:5174](http://127.0.0.1:5174). To run the website API, open another terminal at the repository root and run `npm run dev:server`. Its health endpoint is [127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health).

Build and check the workspaces with:

```powershell
npm run build:client
npm run build:server
npm run lint
npm run typecheck
```

## Deployment

The Cloudflare Worker configuration in [wrangler.jsonc](wrangler.jsonc) serves the built website from `apps/client/dist`. Build the client before deploying it. If an installer download is available, set `VITE_WINDOWS_INSTALLER_URL` in the client build environment. The API in `apps/server` is a separate Node.js service; start its compiled output with `npm run start:server`.

## Project structure

| Path | Purpose |
| --- | --- |
| [apps/client](apps/client/) | React website and setup guide |
| [apps/server](apps/server/) | Website HTTP API |
| [wrangler.jsonc](wrangler.jsonc) | Cloudflare website configuration |

## License

VYORA is a private project with no open-source license. Third-party dependencies retain their respective licenses.
