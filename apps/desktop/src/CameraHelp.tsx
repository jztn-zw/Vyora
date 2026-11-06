import { useEffect, useRef } from 'react';
import './camera-help.css';

export function CameraHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function close() {
    dialog.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      className="camera-help-dialog"
      aria-labelledby="camera-help-title"
      aria-describedby="camera-help-description"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="camera-help-shell">
        <header className="camera-help-header">
          <div>
            <h2 id="camera-help-title">Camera help</h2>
            <p id="camera-help-description">Choose how you want to connect.</p>
          </div>
          <button
            type="button"
            className="outline-button"
            onClick={close}
            autoFocus
          >
            Close
          </button>
        </header>
        <div className="camera-help-content">
          <section>
            <h3>Built-in or USB webcam</h3>
            <p>
              Plug in your webcam if needed, select <strong>Refresh</strong>,
              then choose it in <strong>Camera source</strong>.
            </p>
          </section>
          <section>
            <h3>iPhone or Android phone</h3>
            <p>
              Connect using a webcam app such as Camo and its Windows companion.
              Follow the app’s USB or Wi-Fi setup, confirm its live preview,
              then select that camera in VYORA.
            </p>
          </section>
          <section>
            <h3>DSLR, mirrorless or other camera</h3>
            <p>
              Use the camera’s supported webcam mode, a Windows webcam utility,
              or a compatible capture card. The video source must appear in{' '}
              <strong>Camera source</strong>.
            </p>
          </section>
          <section>
            <h3>Real shutter & external flash</h3>
            <p>
              For a compatible tethered camera, install digiCamControl on this
              computer. Select your camera there, enable its web server and
              confirm that live view and JPEG capture work. In VYORA, open{' '}
              <strong>Capture & lighting</strong>, choose{' '}
              <strong>Tethered camera</strong>, then enable the camera.
            </p>
            <p>
              The camera controls a compatible hot-shoe flash or trigger. VYORA
              requests the shutter and waits for its JPEG. A webcam or
              capture-card video feed cannot provide this shutter control.
              Hardware support varies by model.
            </p>
          </section>
          <aside
            className="camera-help-note"
            aria-label="Connection troubleshooting"
          >
            <p>
              <strong>Source missing?</strong> Select Refresh.
            </p>
            <p>
              <strong>Camera busy?</strong> Close other apps using it, then
              reconnect.
            </p>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
