# Guest displays

VYORA keeps one camera and capture session on the Windows host. Guest displays receive the current session and permitted actions, not library or printer access. Saved images retain the original capture resolution, JPEG quality, mirror setting, slot order and rotation.

## A connected monitor

1. Connect the display and choose **Extend these displays** in Windows.
2. Open **Studio tools (⋯) → Guest displays** from either main tab.
3. Select the extended display and choose **Open guest screen**.
4. Keep the laptop as the controller. The normal Studio is operator assisted: guests see the full-screen preview, countdown and result while you control the shots.
5. **Guest booth → Start guest booth** opens organizer setup. Choose frames and timing, then **Start full-screen booth**. The original full-screen guest interface opens on the main screen and is mirrored as an interactive guest interface on the connected screen. Guests can touch either screen to choose frames, start photos, retake and confirm.

A single display can preview the guest window. Use Alt+Tab to return to the controller. A plain monitor needs touch input or a mouse for self-service actions. Displays supplied by third-party software can be selected if Windows exposes them as extended displays; that software's compatibility and license are separate.

## Android, iPad, Mac or another computer

1. Connect both devices to the same private local Wi-Fi or laptop hotspot. Internet access is not required, but devices must be able to communicate; guest Wi-Fi may isolate clients.
2. Open **Studio tools (⋯) → Guest displays** and select **Enable tablet pairing**. If Windows asks, allow VYORA on the private network used for the booth.
3. Scan the QR code or open the displayed address in a current browser. Enter a device name and pairing code, then choose **Connect to VYORA**.
4. Approve the named device on the laptop. Only approved devices receive session photos and controls.
5. Use the guest page's **Full screen** button where the browser supports it. No store app or spacedesk installation is required.

Pairing codes expire after ten minutes. Stop and enable pairing again to issue a new code; doing so disconnects existing tablets. Approved browsers reconnect using a session cookie while the local server remains enabled. **Disconnect**, stopping tablet access, or closing VYORA revokes access. The pairing code does not grant access without organizer approval. At most eight browsers can wait or connect at once.

This is a local HTTP connection for a private, trusted network; it is not encrypted internet sharing. The server runs only while tablet access is enabled, exposes only the built guest interface, and checks host/origin, authorization and allowed commands. No cloud accounts, hosting fees or tablet camera permission are used. Network or firewall changes may require pairing again. Keep the laptop awake and VYORA open.

## Session behavior

- **Operator assisted:** guests see live preview, countdown and review; the organizer chooses frames, starts captures, requests retakes and confirms saving. After a successful save, the guest screen automatically returns to the live camera and get-ready message for the next group. Self-service retains its finished-strip screen and Next group action.
- **Self service:** guests choose from the organizer's allowed frames, start, select individual retakes, confirm, and move to the next group. This mode is entered through **Start guest booth → Start full-screen booth** and retains the original carousel, full-screen camera and review design. The main screen and connected guest screen follow the same session. Exit the booth to return to operator-assisted Studio.
- With **Auto-print** enabled, saving holds both screens on printing until Windows accepts the job and the group chooses **Next group**. Assisted mode waits for the operator. Failed/uncertain jobs require operator help; guest commands cannot retry, skip, or advance a pending print. See [printing](printing.md) for readiness and recovery limits.
- **Pause booth** prevents new guest actions. **Stop & pause** interrupts the current countdown and preserves already captured photos for review.
- Disconnecting a monitor or browser does not close the host session or discard captured photos. A reconnected guest returns to the current session. Closing the host application still loses any unconfirmed photos held in memory, as before.
- The host is the only capture owner. Commands include a session-state revision. Stale, repeated, concurrent, unavailable and unauthorized actions are rejected; saving retains the existing single-save lock.
- Displayed preview frames are resized to at most 960px wide and sent at approximately 6–8 fps, depending on encoding and network speed. Full-resolution photos and finished strips use the existing capture/export pipeline. This first version prioritizes predictable local transport; a streamed video transport can improve preview motion later.
- State updates are separate from preview traffic. Frame artwork and captured images use authorized, content-addressed local URLs. Heartbeats do not change command revisions, and guests stop accepting actions if the controller stops responding.
- Guest screens follow the controller's Light, Dark or VYORA theme. Browser layouts adapt to portrait and landscape.
- Studio and guest cameras show the selected frame's crop with the outside dimmed. When one capture fills differently shaped areas, the guide shows their common safe region. Keep everyone inside that guide; frame decorations can still cover parts of a photo. The source photo stays uncropped by the template during the unsaved session.
- Review thumbnails use the frame's crop. **Adjust framing** lets the operator or self-service guest select an area, drag its photo, and zoom before applying the position. Arrow keys also move the photo; Shift moves farther. Linked areas can have independent positions. Apply or cancel before confirming. Retaking a photo resets the positions of its linked areas; other photos keep their positions. Applied positions survive returning to review while VYORA stays open, and are flattened into the saved JPEG used for printing. Unconfirmed originals still live only in RAM.
- Countdown digits use one shared capture deadline. Guest screens compensate for their clock difference and estimated request latency, then advance the digits locally rather than waiting for each number over the network. Studio and guest screens share the same themed countdown dial and animation; reduced-motion preferences disable the animation. The host remains the only device that triggers the photograph.

## Development and validation

The renderer build includes `index.html` and `guest.html`. Run `npm run make:desktop` to produce a complete installer. A fresh development server can open an attached guest window; tablet access also needs the built guest assets in `.vite/renderer/main_window` (run a renderer production build before enabling tablet access in development).

Focused checks:

```powershell
node --test apps/desktop/tests/guest-hub.test.mjs
npm exec --workspace=@vyora/desktop -- electron tests/guest-display-smoke.cjs
```

The integration check uses isolated test storage, a synthetic camera, a separate guest window and a browser without the Electron preload. It covers frame selection, capture, individual retake, confirmation, next group, browser approval, reload and revocation. Artifacts are in `apps/desktop/out/test-guest`. Physical Android/iPad/Mac devices, real multi-monitor placement and Wi-Fi performance require hardware testing; the automated checks do not establish compatibility for every device.
