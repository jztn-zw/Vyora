# Architecture

## Current implementation

The desktop keeps completed strips locally. React handles the camera preview
and capture controls. A sandboxed preload exposes library reads, staging a JPEG
in RAM, strip-folder opening, in-memory sources for a known session, finished-strip
saving, reading the composite JPEG for a known saved strip, and revealing an
already-saved strip. Full-size preview reads resolve a validated strip ID through
the active library; renderer callers cannot supply a filesystem path.

Appearance is selected in the renderer with CSS theme tokens. The local
`vyora.appearance` preference accepts only light, dark, or vyora and is applied
before React mounts. A sender-checked, allowlisted `window:theme` operation keeps
Electron's native appearance and window background in sync. Theme changes do not
change the captured image pixels or the exported template artwork.

The Electron main process verifies the requesting window and frame, decodes
and validates image input, creates a thumbnail, and owns SQLite and filesystem
access. The renderer cannot choose arbitrary write paths, execute commands,
or access database credentials. Audio access and external navigation are denied.

Each session receives a UUID and at most four captured JPEGs are held in the main
process's RAM buffer. No individual JPEGs or image thumbnails are persisted for
new captures. Pending session previews can be restored after a renderer refresh,
but closing the app or a process crash loses unsaved captures.

Schema version 3 adds a `strips` table. Schema version 4 adds a `templates` table
and local normalized PNG frame files. Template import verifies image format,
dimensions, area bounds, and photo count in both renderer and main process. The
main process decodes and re-encodes the frame; callers cannot supply write paths.
Templates are immutable and each capture session retains its chosen frame and
layout until the finished JPEG saves. Custom output dimensions match the imported
frame. Transparent PNGs overlay cropped photos; opaque frames sit behind them.

Completed strips retain capture IDs,
dimensions, timestamps, and one composite thumbnail. Individual-photo image data
is removed from the stored strip metadata. The legacy `photos` table and existing
files remain readable and untouched. The prior v1-to-v2 session-grouping migration
is retained; exporting a legacy session does not duplicate its gallery entry.

The renderer composes the Doodle No. 01 frame using in-memory sources for a
720px-wide strip export. The main process validates and flushes the finished JPEG
to a temporary file, renames it under `strips/`, then inserts its metadata. It
clears the captured JPEGs from memory only after saving succeeds. A stopped or
disconnected session with captured shots opens review for a partial strip. The
renderer never auto-saves new captures: users select retake targets by photo ID,
capture replacements into the same RAM slots, then confirm the current strip.
The main process validates replacement images and session membership. Slot IDs,
session timestamp and template remain stable. No replacement writes an individual
file or database photo. Failed saves retain the RAM buffer and review remains
available; another session cannot overwrite that buffer. Retakes after saving are
unavailable because the source photos have been released.
Already-saved strips open in the in-app image preview instead of being rebuilt
from originals. The preview fits the complete strip automatically and saving
does not open File Explorer.
File and database commits are not one transaction; a process crash between the
rename and insert can still leave an orphan strip file. Renderer callers cannot
select arbitrary input or output paths.

Development photos are isolated inside the desktop project. Packaged app data
lives outside the source and install directory. The photo library is independent
of network state and cloud service availability.

The website client lives in `apps/client` (previously `apps/viewer`). It is
currently a standalone React page that does not fetch a gallery or accept share
tokens. `apps/server` is a separate Node.js/TypeScript API starter with a
`GET /api/health` endpoint. During development, Vite proxies `/api` from the client
to the server. This server has no upload routes, authentication or database yet;
it does not access the desktop library or replace guest-device pairing.

## Planned online sharing

Neon is the proposed cloud provider, subject to verifying the chosen region,
available services, and free-plan allowances when integration begins. Keep the
cloud adapter separate from capture and local storage. There is no deployed
backend, hosting account, or provisioned database in this scaffold.

Proposed flow:

```text
Capture into RAM -> save finished strip locally -> prepare chosen upload copy
        -> persist upload job in SQLite -> authenticated upload endpoint
        -> private object storage + gallery metadata -> mark ready
        -> show share link / QR -> browser viewer -> authorized download
```

Database records describe albums, photo ownership, object keys, share tokens,
expiry, and upload state. Actual images belong in object storage. Account owners
can manage their own uploads; guests access only the scope of their gallery link.

Sharing should default to one session. Event-wide galleries should require an
organizer's explicit choice. This default remains a proposed product decision.

Use high-entropy, revocable share tokens, store their hashes server-side, and
validate them before issuing short-lived image/download URLs. A QR code encodes
the viewer link rather than granting access to an entire storage bucket. Guests
with a share link can pass it on; offer expiry and revocation accordingly.

Never put database passwords, storage signing secrets, or privileged service keys
in React bundles or the distributed desktop app. Owner uploads should use scoped
authentication and server authorization. Check file types, size, ownership, and
object keys on the server.

Upload jobs must survive restart, retry safely with stable photo IDs, and show
queued/uploading/failed/ready states. Show a gallery as ready only after its files
are available. Deleting an online copy must not silently delete its saved local strip.

The viewer will need separate free web hosting. Hosting, database, object storage,
and image-download bandwidth have independent limits; a free database does not
mean unlimited online photo hosting. Compress upload copies and generate thumbnails
locally, while retaining the finished strips in the desktop library.

## Camera boundary

Webcams, compatible USB webcam modes, manufacturer virtual-camera utilities,
and compatible HDMI capture devices can expose a video source. Current capture
saves frames from that source; this is not the same as full-resolution DSLR capture.

Add a separate camera adapter for model-specific shutter triggering and original
file download. Prove live preview, capture, reconnect behavior, and long-running
operation with an actual camera before declaring that model supported.

## Desktop printing

The renderer requests printer detection, configuration, and saved-strip printing
through sender-checked IPC. The main process owns validated, atomic printer
preferences and a serialized job service. Requests contain library IDs and UUID
request tokens; renderers cannot provide file paths, print markup, or arbitrary
printer options. The selected printer is checked against fresh system detection
before each job, without fallback to another device.

An isolated, sandboxed hidden window decodes the saved JPEG and prints fixed
2 × 6-inch, two-up 4 × 6-inch, or fixed-size strip placements on a larger physical
sheet. Its document blocks scripts and external
resources; it has no preload or Node access. Print workers close after completion,
failure, or canceled preparation. Delayed native responses remain uncertain and
locked instead of retrying. Submission success does not assert physical completion.

Full-sheet printing adds a main-process PaperService with an atomic, versioned
`paper-state.json` store. Paper dimensions and rectangles use integer microns;
placement validation independently enforces printable margins, gaps, bounds,
rotation, and exact 50,800 × 152,400-micron strips. Standard presets are fixed;
custom dimensions require a verified, matching-printer profile. No image paths
or renderer-authored markup enter the print worker.

Queue mutations are serialized. A sheet batch reserves its queue entries and
positions durably before native submission. Outcomes remain check-required until
the operator confirms the physical result. Printed entries are consumed; spoiled
areas are conservatively occupied while entries remain queued. Restart recovery
preserves reservations and never resubmits. Damaged records or failed outcome
writes disable sheet operations instead of discarding occupancy. Geometry,
persistence, recovery and native page targets have simulated regression tests.
See [printing setup and recovery](printing.md) for operator-facing limits.
