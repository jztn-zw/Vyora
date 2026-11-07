# VYORA

An offline-first Windows photobooth with a separate browser-based photo viewer.

## Workspace

```text
apps/
  desktop/         Electron Forge + Vite + React + TypeScript
    src/storage/   Local SQLite library and photo files
  client/          React + Vite website and guest gallery starter
  server/          Node.js + TypeScript website API starter
packages/
  shared/          Shared TypeScript contracts
docs/
  architecture.md  Boundaries, storage, and planned online sharing
```

All selected development dependencies are available without subscription fees.
This private application's source is not assigned an open-source license. Third-party
dependencies retain their respective licenses and notices.

## Requirements

- Windows 10/11 for the initial target.
- Node.js 22.12+ in the 22.x line, or Node.js 24+; npm is included with Node.
- Internet access for the initial dependency download. Capturing and saving do not
  require internet after setup.
- A webcam or a camera exposed to Windows as a webcam, or a compatible tethered
  camera with the separately installed digiCamControl connector. The optional
  native-shutter integration still needs verification with physical hardware.
  See [tethered camera and flash setup](docs/tethered-cameras.md).

## Start

Run these commands from the repository root:

```powershell
npm ci
npm run dev
```

The desktop app opens as a native window. Click **Enable camera**, choose a timer,
then click **Take 4 photos**. Choose the photo effect during review.
Individual shots remain in memory until review and confirmation. Only the
confirmed strip saves to VYORA's library. Stopping after at least one shot leaves
a partial session available for review. **Mirror photos** applies to the captured
photos and finished strip. A tethered camera or its external connector may keep
individual originals separately.

To use an iPhone on Windows, install **Camo Camera** on the phone and **Camo
Studio** on the PC. Connect by USB data cable (or pair in Camo for Wi-Fi), confirm
the live preview in Camo Studio, then choose **Refresh** and the Camo camera in
VYORA. Click **Camera help** beside the camera selector to open a help modal covering
built-in/USB webcams, iPhone/Android webcam apps, and compatible external cameras.
[Camo's official setup guide](https://camo.com/support/how-to/use-iphone-as-webcam)
describes installation and pairing. Camo must be installed and running separately;
VYORA does not include an iOS app or camera driver.

VYORA remembers the last camera with a working preview, including phone/virtual
cameras. It matches a changed device ID only when the saved camera name uniquely
matches; an unavailable selection does not silently switch to another camera.
Enabling or reconnecting requires a click. Driver-reported pauses/disconnections
stop the current session and keep shots already captured for review as a partial strip.
The preview can recover after a temporary pause, but a stopped session does not
resume automatically. Stalled connections time out after 15 seconds.

For a guest-facing event experience, choose **Start guest booth** in Studio.
First select the four-photo frames guests may choose, set the countdown,
then choose **Start full-screen booth**. Guests select an
enabled frame from the centered chooser over the full-screen live camera, see a get-ready prompt, and tap **Start photos** to begin the
countdown. They can retake selected shots before confirming. The saved strip is
shown on screen; **Next group** returns to the frame chooser. **Exit booth**
returns to Studio. Kiosk mode works offline; online galleries and online photo sharing
aren’t part of this flow yet. See the [guest booth guide](docs/guest-kiosk-mode.md).

Choose **Studio tools (⋯) → Guest displays** to keep the laptop as an organizer controller and show
the booth on an extended monitor or a paired browser on an Android tablet,
iPad, Mac or another computer on the same private network. Both operator-assisted
and self-service sessions use one camera and save on the Windows host.
See [Guest displays](docs/guest-displays.md) for pairing, permissions and setup.

Camera behavior is covered by simulated-device tests. iPhone/Camo hardware
compatibility, USB/Wi-Fi reliability, and final image quality still need checking
on the actual devices. Some virtual drivers keep sending a placeholder when the
phone disconnects; VYORA cannot distinguish that picture from live camera frames.
Check the preview before starting a session.

Each session appears as one VYORA photo strip with the Doodle No. 01 frame.
After capture, select any photos to retake on the review screen. Retakes replace
only those positions; the other photos and selected frame stay intact. Review
again, then choose **Confirm & save strip** to save the JPEG under the active
library's `strips/` folder. **Back to booth** keeps the session in memory, and
**Review photos** reopens it. Retakes are available before confirmation only.
Library cards are compact; click the image or **View** to open a larger
in-app preview. The whole strip automatically fits the preview window. Close it
with **Close**, Escape, or a click outside the preview. Saving from the preview
does not open File Explorer; **Tools → Strip folder** remains available in the main header.
If saving fails, keep VYORA open and choose **Retry save**. Unsaved captures stay
in memory until the strip saves or the app closes; new sessions are blocked
until the pending strip is saved. Individual shots are not recoverable after closing.
Existing photos in `photos/` remain untouched. Legacy sessions can still be exported.

Choose **Tools → Printer settings** in the header to detect Windows printers and save your choice,
paper layout, and sheet count. **Two strips** prints two 2 × 6-inch strips on a
4 × 6-inch sheet; **One strip** requests 2 × 6-inch paper from a compatible printer.
After confirming and saving a session, its preview opens with **Print strip**.
Saved strips can also be printed from their library previews. Printing is manual;
capturing, saving, and opening previews never send a job automatically.

For ordinary desktop printers, choose **Full sheets**, then **Save & arrange
paper**. Add saved strips to the queue and arrange them on long bond, A4, Letter,
or a measured rectangular piece supported by that printer. Strips remain 2 × 6
inches for manual cutting. **Paper & layout** remembers used areas and queued
strips across restarts; confirm the physical result after each submission.
Custom pieces require verified printer-size limits in settings.

The app keeps the selected printer if Windows stops detecting it. Print requests
use the saved full-resolution JPEG, fit the complete design without cropping, and
submit one job at a time. **Sent to printer** means Windows accepted the job, not
that the physical print has finished. See [printing setup](docs/printing.md) for
paper alignment, cutting, and uncertain-job recovery.

Open **Studio tools (⋯) → Appearance** to choose **VYORA**, **Light**, or
**Dark**. The first launch uses VYORA's purple and pink theme. The app saves
your choice on this device and restores it when you reopen Studio.

Custom PNG/JPEG frames can be imported through **Upload a strip template** in
the booth settings. Review or mark four photo areas, try sample photos, then
choose **Save & use template**. The frame is available offline after restart. See the
[template guide](docs/custom-strip-templates.md) for the workflow and limits.

Start the website client and API in separate terminals from the repository root:

```powershell
npm run dev:client
```

```powershell
npm run dev:server
```

Open `http://127.0.0.1:5174` for the website. The API health endpoint is
`http://127.0.0.1:8787/api/health`; the client forwards `/api` requests there during
development. The website still shows its gallery setup state. Uploads, accounts,
database storage and gallery retrieval are not connected yet. No cloud account
or environment variables are needed for this starter.

Use `npm run dev:desktop` for the Electron app. `npm run dev` still starts the
desktop, and the older `dev:viewer` / `build:viewer` commands remain aliases for
the client. See [project folders and commands](docs/project-structure.md).

## Checks and builds

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build:client
npm run build:server
npm run package:desktop
npm run test:storage
npm run test:camera
npm run test:printing
npm run test:strips
npm run test:templates
npm run test:retakes
npm run test:review-ui
npm run make:desktop
```

The review UI test and storage smoke test require a desktop build from `npm run package:desktop`
or a prior successful `npm run dev` to compile the Electron entry points and
storage module. It creates an isolated temporary library,
checks saved bytes and metadata, rejects invalid input, reopens the library,
then removes only its own test directory.

The camera tests cover device selection, changed device IDs, denied access, and
rejection of synthetic camera streams. Normal launches ignore Chromium's fake-camera
flags and prefer an integrated or USB webcam when one is listed. Choose another
source in the camera menu or use **Refresh** after connecting a webcam. Only one
VYORA window runs at a time, so duplicate launches cannot hold the camera separately.

`package:desktop` produces an unpacked Windows application under
`apps/desktop/out/`. `make:desktop` creates the installer and ZIP under
`apps/desktop/out/make/`. The Windows setup wizard is
`VYORA-0.1.0-Setup.exe`; share this single file with testers. It includes the
testing terms, destination folder, desktop shortcut choice, progress, and Launch
VYORA option. See [Windows installer](docs/windows-installer.md), including
instructions for replacing an older Squirrel installation.
Packaging and installer generation may need internet
for tooling and Electron downloads. Unsigned development builds may show
Windows publisher warnings; code signing is a separate distribution decision.

`format` formats the workspace; lint and typecheck are read-only.

## Local data

- Development: `apps/desktop/.local-data/library/`.
- Packaged application: the Electron user-data directory for VYORA, typically
  `%APPDATA%\VYORA\library\` on Windows.
- `library.sqlite` holds metadata and bounded thumbnails.
- SQLite uses Electron's bundled `node:sqlite` API; no separate database server
  or Windows C++ build tools are needed.
- `photos/`, if present, contains photographs from older builds; new captures do not add files there.
- `strips/` holds the finished VYORA-branded strip JPEGs.
- `templates/` holds imported PNG frame assets; layout information is in SQLite.

Use **Tools → Strip folder** to find the saved strips. Back up the entire
library with VYORA closed, including any SQLite sidecar files. Deleting the
development data directory deletes your development photos; it is ignored by Git.

## Implemented in this foundation

- Isolated Electron preload bridge with sender checks and video-only permission handling.
- Webcam selection and preview, 3/5/10-second countdowns, and 2/3/4-shot sequences.
- Guest kiosk flow with a full-screen camera, centered frame selection, capture review, and next-group reset.
- Photo review, selective or full retakes, and confirmation before saving the strip.
- Strip-only local JPEG saving, SQLite strip metadata, composite thumbnails, and folder opening.
- Session-based photo strips, a VYORA doodle frame, template preview, and JPEG export.
- Reusable PNG/JPEG template import, photo-area detection and editing, and custom-size output.
- Separate capture and library views with camera, empty, and error states.
- Independent responsive viewer starter and shared data contracts.
- Windows packaging configuration and a real local-storage smoke test.

## Next milestones

1. Resolution/orientation settings and configurable library location.
2. More template-management controls and per-photo crop adjustments.
3. Event organization and backup/restore UI.
4. Persistent upload queue, cloud access control, gallery links, QR codes, and viewer downloads.
5. Camera-model-specific DSLR tethering and release validation on actual hardware.

Online uploads, Neon integration, authentication, gallery retrieval, printing,
and full-resolution DSLR capture are not implemented yet.
No photos are uploaded by this scaffold.

See [validation results](docs/validation.md) for completed checks and testing limitations.
