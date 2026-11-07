# Guest kiosk mode

Choose **Start guest booth** in the Studio toolbar to open organizer setup. If a
guest display is active, this action is in the **Guest booth** menu. Select
which four-photo frames guests may use and set the countdown duration.
Select **Start full-screen booth** when setup is ready.
VYORA requests fullscreen when the system allows it; the booth still works in
a regular window if fullscreen is unavailable. VYORA remembers the frame allowlist
and countdown on this computer.

## Guest flow

1. The live camera opens immediately with the available frames centered over it.
2. Guests choose from the four-photo frames enabled by the organizer.
3. The frame chooser clears and VYORA displays “Get ready for your photos.”
   Guests look at the camera and select **Start photos** to begin the countdown.
   The camera fills the window, with a small **Exit booth** control in the corner.
4. On review, guests choose Original, Black & white or Warm and can select photos
   to retake. If capture stopped early, **Take remaining photos** finishes the
   four-photo strip.
5. After **Confirm & save strip**, VYORA saves the final JPEG locally and shows
   its preview. **Next group** returns to the centered frame chooser over the camera.

The top-right **Exit booth** control returns to Studio. It is intentionally
visible so an operator can leave the guest screen; kiosk mode does not lock
Windows or prevent access to other applications.

## Current limits

- The guest chooser uses the organizer’s local frame allowlist. Multiple named
  event profiles and online event management are not implemented.
- Capture and strip saving work offline. Online event galleries, QR codes,
  guest downloads, and automatic printing are not part of the kiosk flow yet.
- Captured individual photos stay in memory until the final strip is confirmed;
  closing VYORA before saving loses that unconfirmed session.
