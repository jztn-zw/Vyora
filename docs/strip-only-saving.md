# Strip-only saving

New captures stay in the Electron main process's memory until the strip is
confirmed by the user. After capture, the review screen shows individual photos
and the strip preview. Users can choose one, several or all photos to retake,
then review the replacements. **Confirm & save strip** writes one finished JPEG
under `library/strips/`. It does not create individual JPEGs, insert
new individual-photo records, or store individual image data in strip metadata.

Optional [tethered capture](tethered-cameras.md) uses digiCamControl, which may
retain original individual files in its session folder or on the camera. Those
copies are separate from VYORA's library and are not deleted by VYORA.

The library stores a composite thumbnail, timestamps, dimensions, and IDs.
Saved strips reopen without their source photographs. **Show strip** reveals
the existing JPEG; **Strip folder** opens the output folder.

If saving fails, the review remains available with its current photos and a save
retry. **Review photos** reopens it from the booth, and pending gallery items open
the review screen. New sessions are blocked until the current strip is confirmed.
Retakes use the chosen countdown and replace only selected positions in capture
order. Stopping or disconnecting during retakes keeps replacements already taken
and preserves the originals for the rest. Pending previews can be recovered after
a renderer refresh while the main process remains running. Unsaved shots are
lost if the application closes or crashes. Captured images are released from
the buffer after the strip saves successfully.

Saved strips cannot be retaken after confirmation: their individual source photos
have been released. This review flow applies to the current unsaved session.

Review/retake validation: unit tests cover selected positions in two-, three- and
four-photo sessions, repeated retakes, stopped batches, and stale-ID rejection.
The isolated Electron UI test uses canvas-generated video, synthetic photos and
mock IPC to exercise countdown, selective replacement, the confirmation gate,
failed-save recovery, final JPEG rendering and closing review after saving.
It also produces `apps/desktop/out/test-review/capture-review.png` for visual QA.
The storage smoke test exercises the real RAM buffer and SQLite library without
reading user data. Physical webcam retakes remain a hardware testing step.

Existing individual photos and prior session records are preserved. They remain
readable for legacy strip exports; exporting an old session does not duplicate
its gallery entry. Schema version 3 adds finished-strip records without deleting
the older photo table or files.

The local gallery checks that saved JPEGs still exist before listing entries or
counting strips. Legacy sessions are listed only when all required source photos
exist. Missing files are hidden, without deleting their SQLite metadata; restoring
the original filename to its original folder makes the card reappear. Availability
is checked before choosing the latest 12 strips. The library refreshes when opened
and when returning to VYORA, while capture/save operations are idle. A failed
full-size preview also refreshes the library and closes a missing entry.

Validation on October 31, 2026:

- TypeScript, lint, and formatting checks passed.
- Photo-strip tests: 4 passed. Camera tests: 8 passed.
- Electron storage regression passed: four shots remained in RAM with no photo
  folder or database photo records; saving produced one strip; failed saves were
  retryable; partial strips saved; completed strips survived reopening; legacy
  migration preserved existing photo files and gallery counts.
- No real webcam session or manual UI check was performed for this change.

The regression uses isolated temporary libraries and synthetic image bytes.
It does not read, modify, or delete the user's existing photo library.
