---
name: vyora-e2e
description: Verify VYORA user flows end to end in the browser or Electron. Use for website and guest downloads, offline capture and review, local guest devices, or desktop-to-web sharing changes.
---

# VYORA end-to-end verification

Run commands from the VYORA workspace root. Use test images and isolated profiles or libraries. Keep real guest photos, production credentials, and live printer jobs out of automation.

## Website

- Start `npm run dev:client` at `http://127.0.0.1:5174`. For API-backed flows, start `npm run dev:server` and check `/api/health` through the client origin. The Vite proxy is a local development feature. For deployment checks, verify direct route loads and API routing through the production entry point.
- Use a real browser at desktop and phone widths. Follow the affected path from a direct link or primary button and verify the visible result. For the demo or guest download, check the file opens as the expected JPEG and matches the strip shown.
- As sharing becomes available, verify that a saved strip stays local when offline, a failed upload can retry without creating a duplicate, and the QR appears only when the strip is downloadable. Verify that one valid guest link exposes only its strip and that expired, revoked, or malformed links fail without exposing image data. Use a separate browser session for guest access. Check a real iPhone or Android QR scan when that hardware is available.

## Desktop

- Inspect the root and desktop `package.json` scripts. Use `npm run test:review-ui` for the existing renderer smoke test, `npm run test:storage` for Electron and SQLite persistence, and the focused test script for changed capture, template, or print behavior. The renderer smoke test uses synthetic photos and stubbed IPC.
- Build current desktop sources with `npm run package:desktop` when needed before running build-dependent smoke tests. Check which output the test loads so that a stale renderer or packaged app cannot stand in for changed code. Use relevant existing scripts under `apps/desktop/tests` for editor and guest-display checks.
- If the changed flow depends on a real camera, printer, or guest device, record simulated and physical results separately. Report the exact checks run, what each covered, and any flows still unavailable or unverified. When adding a regression test, reuse the existing harness where it can exercise the behavior.
