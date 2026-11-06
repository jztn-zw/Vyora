# Desktop home redesign

The desktop photo booth now uses a grayscale palette, compact top navigation,
editorial typography, layered photographic prints, and a separate session setup
panel. The existing camera capture and local-library implementation is retained.
The palette applies to the interface; captured originals keep their colors.

## Validation

- Passed: workspace TypeScript, lint, and formatting checks.
- Passed: production renderer build with the installed Vite tool.
- Inspected the camera-off page in the native Electron window, then refined the
  photo-stack size and caption spacing.
- Refined the desktop layout and replaced the native camera dropdown with a
  device menu, refresh action, connection details, reconnect guidance, and a
  camera-off control. Checked the layout at 1440px and 1040px widths.
- Passed: eight focused camera tests covering device selection, stale IDs,
  blocked access, and rejection of Chromium synthetic streams.
- Verified the real HD Webcam through the app at 1280 × 720. Preview mirroring
  worked and turning the camera off released the stream. No photos were taken.
- Closed an older VYORA process that held the webcam. Normal launches ignore
  fake-camera flags and prefer a hardware webcam over phone/virtual sources.
- Real-camera capture sequences, physical unplug/reconnect, and release testing
  on another Windows computer remain unverified.

## Welcome artwork

Asset: [booth-friends.png](../apps/desktop/src/assets/booth-friends.png).
Generated with the built-in image-generation tool. It is decorative sample
artwork and is never inserted into the user's photo library.

Final generation prompt:

> Use case: photorealistic-natural. Asset type: bundled decorative welcome photo for a black and white desktop photobooth app. Create a single beautiful square black-and-white candid analog photobooth portrait of two young adult Asian women best friends, shoulder-to-shoulder, laughing naturally at the camera, one with a playful wink, one making a peace sign near her cheek. Both wear simple dark casual clothing. Very close crop from chest up, faces in the central 65% of composition. Plain light gray photographic studio backdrop. Direct flash, rich blacks, soft film grain, tactile 35mm editorial photography, authentic spontaneous joyful moment, crisp faces. Strictly grayscale black white gray only. Full bleed photography, no border, no frame, no writing, no typography, no watermarks. This image will be used as a decorative sample, not represented as a real user photograph.
