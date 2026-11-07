# Tethered cameras and flash

VYORA has two capture methods under **Studio tools** (⋯) → **Capture & lighting**.
**Webcam / video camera** remains the default. It captures video frames
and works with continuous lighting. **Tethered camera** requests a real shutter
through the optional, separately installed digiCamControl connector and uses the
returned full-resolution JPEG. A compatible camera controls its flash through its
hot shoe, sync connection or supported flash trigger.

This integration has automated simulated-connector and renderer checks. It has
not yet been verified with physical camera/flash hardware. Compatibility is
model-specific; this does not add native shutter support to every camera, phone,
webcam, HDMI capture card or USB flash accessory.

## Set up

1. Check the [digiCamControl supported-camera list](https://www.digicamcontrol.com/cameras).
   Your camera must support both live view and remote capture. digiCamControl is
   [free software](https://www.digicamcontrol.com/), installed separately from
   [its official download page](https://www.digicamcontrol.com/download).
2. Connect the camera to the Windows computer and select it in digiCamControl.
   Close other camera-control applications that compete for its USB connection.
3. Select JPEG capture, enable transfer to the computer, and disable keeping the
   camera's original filename. Confirm that live view and a manual capture work
   in digiCamControl before using VYORA. Choose the connector's session folder
   deliberately: it may retain individual originals, as may the camera's card.
4. Enable digiCamControl's web server in **Settings → Webserver**. Its documented
   default port is **5513**. Restrict its network access to this computer; VYORA
   only connects to `127.0.0.1`. This connector is separate from VYORA guest-device
   pairing and does not need access from other devices.
5. In VYORA, open **Studio tools** (⋯) → **Capture & lighting**, choose
   **Tethered camera**, and check the port. Select **Done**, then **Enable camera**
   in the preview. VYORA starts the connector's live view and
   minimizes its windows. It must remain running in the background.
6. Attach a flash/trigger compatible with the camera and configure it using the
   hardware manuals. Use exposure and shutter settings compatible with that
   camera's flash synchronization. VYORA does not set flash power, select TTL,
   measure recycling, or verify that the flash fired.
7. Set **Flash recovery time** (0–10 seconds; default 2 seconds). VYORA waits at
   least this long after a successful transfer before the next countdown. Test a
   complete sequence at the flash power you intend to use, including retakes,
   before an event. Increase recovery time if your equipment needs it.

## Capture, stopping and failures

Each countdown requests one shutter. VYORA waits for the JPEG with that request's
unique filename, rejects unrelated previous photos and checks camera identity.
The original dimensions are used; the existing photo effect, mirror setting,
slot rotation, review, retake and final strip export still apply. Live view is a
smaller preview and is never substituted for a failed native photo.

Do not change cameras or take pictures directly in digiCamControl during a VYORA
sequence. VYORA assigns a unique filename for each exposure; this also changes
the connector's session filename template. Restore your preferred template in
digiCamControl when you stop using VYORA.

Stopping a sequence prevents subsequent exposures. A shutter command already sent
cannot be undone. VYORA waits for the in-progress transfer to settle and discards
a cancelled result. An interrupted or ambiguous transfer blocks further shutter
requests until you check the camera and deliberately reconnect. It does not
automatically retry an exposure. If focus, live view or flash operation differs
on your camera, confirm its behavior in digiCamControl first; some models cannot
capture while live view is active.

VYORA's library still saves only the confirmed strip. The connector and camera
can retain individual files independently; VYORA does not delete those copies.
RAW-only capture is unsupported. Originals larger than 20 MB are rejected.

Protocol references: [HTTP interface](https://www.digicamcontrol.com/doc/userguide/web)
and [single commands](https://www.digicamcontrol.com/doc/userguide/singlecmd).
