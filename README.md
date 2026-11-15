<h1 align="center">
  <img src="apps/client/src/assets/vyora-emblem.webp" alt="VYORA Photobooth" width="96">
</h1>

<p align="center">
  <strong>An offline-first photobooth for Windows</strong><br>
  Capture photos, design strips, run a guest booth, and print from your local library.
</p>

<p align="center">
  <a href="#what-is-vyora">What is VYORA?</a> ·
  <a href="#features">Features</a> ·
  <a href="#using-the-booth">Using the booth</a> ·
  <a href="#website-development">Website development</a>
</p>

<p align="center">
  <img src="apps/client/src/assets/vyora-studio-preview.webp" alt="Preview of VYORA Studio" width="880">
</p>

## What is VYORA?

VYORA turns a Windows computer and camera into a photobooth. An operator can choose a frame, take a set of photos, review or retake shots, save the finished strip, and print it. For events, guests can use a self-service booth or a paired device on the same private Wi-Fi network or hotspot.

Capture, local saving, and printing work without an internet connection. The website introduces the app and provides a setup guide; the photobooth runs on the Windows computer.

## Features

| At the booth | What VYORA does |
| --- | --- |
| **Capture and review** | Choose a 3, 5, or 10 second countdown, adjust framing, apply an effect, and retake individual shots before saving. |
| **Frames and layouts** | Pick an included VYORA frame or import a PNG or JPEG frame and place its photo areas in the template editor. |
| **Guest sessions** | Run a full-screen booth on the host computer, use another monitor, or pair a guest device over local Wi-Fi. The host approves paired devices. |
| **Save and print** | Keep completed strips in the local library. Print a strip, use optional auto-print, or arrange photos on supported paper sizes. The print preview warns if the saved image may look soft at the selected size. |

## Using the booth

VYORA runs on Windows 10 or 11 with a camera Windows can access. In **Photo booth**, choose a frame and countdown, enable the camera, and start a session. Review the photos, replace any shot you want to retake, then select **Confirm & save strip**. Open **My library** to view or print saved strips.

A phone can provide video through a Windows webcam app. Compatible cameras can also use an optional tethered connection, depending on the camera model. A guest phone connected to the same local network can use VYORA's paired guest booth without internet access.

## Website development

This public repository contains the VYORA website and its API. The Windows application is maintained separately.

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
