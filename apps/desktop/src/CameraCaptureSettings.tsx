import { useEffect, useRef } from 'react';
import type { CaptureSource } from './tethered-camera-controller';
import { StudioSelect } from './StudioSelect';
import { NumberInput } from './NumberInput';
import './camera-capture-settings.css';
export interface CaptureEquipment {
  source: CaptureSource;
  port: number;
  recoveryMs: number;
}
export function CameraCaptureSettings({
  value,
  disabled,
  onChange,
  onClose,
}: {
  value: CaptureEquipment;
  disabled: boolean;
  onChange: (value: CaptureEquipment) => void;
  onClose: () => void;
}) {
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
      className="camera-dialog capture-equipment"
      aria-labelledby="capture-equipment-title"
      aria-describedby="capture-equipment-description"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
    >
      <div className="camera-dialog-shell">
        <header className="camera-dialog-header">
          <div>
            <h2 id="capture-equipment-title">Capture & lighting</h2>
            <p id="capture-equipment-description">
              Choose how Studio takes photos.
            </p>
          </div>
          <button
            type="button"
            className="outline-button"
            onClick={close}
            autoFocus
          >
            Done
          </button>
        </header>
        <div className="camera-dialog-content capture-equipment-content">
          <div className="capture-equipment-method">
            <span>Capture method</span>
            <StudioSelect
              label="Capture method"
              value={value.source}
              disabled={disabled}
              onChange={(source) =>
                onChange({ ...value, source: source as CaptureSource })
              }
              options={[
                {
                  value: 'webcam',
                  label: 'Webcam / video camera',
                  description: 'Capture from the live video feed',
                },
                {
                  value: 'tethered',
                  label: 'Tethered camera',
                  description: 'Native shutter and JPEG · digiCamControl',
                },
              ]}
            />
          </div>
          {value.source === 'tethered' ? (
            <>
              <p>
                Open digiCamControl, select a supported camera and enable its
                web server. Use JPEG capture. VYORA connects on this computer.
              </p>
              <div className="capture-equipment-fields">
                <label>
                  Connector port
                  <NumberInput
                    stepLabel="Connector port"
                    min={1024}
                    max={65535}
                    step={1}
                    value={value.port}
                    disabled={disabled}
                    onChange={(event) => {
                      if (
                        Number.isInteger(event.target.valueAsNumber) &&
                        event.target.valueAsNumber >= 1024 &&
                        event.target.valueAsNumber <= 65535
                      )
                        onChange({
                          ...value,
                          port: event.target.valueAsNumber,
                        });
                    }}
                  />
                </label>
                <label>
                  Flash recovery time (seconds)
                  <NumberInput
                    stepLabel="Flash recovery time"
                    min={0}
                    max={10}
                    step={0.5}
                    value={value.recoveryMs / 1000}
                    disabled={disabled}
                    onChange={(event) => {
                      const seconds = event.target.valueAsNumber;
                      if (
                        Number.isFinite(seconds) &&
                        seconds >= 0 &&
                        seconds <= 10
                      )
                        onChange({
                          ...value,
                          recoveryMs: Math.round(seconds * 1000),
                        });
                    }}
                  />
                </label>
              </div>
              <p>
                The camera fires a compatible flash through its hot shoe or
                trigger. Set flash mode and power on that hardware. This delay
                allows recovery; it does not detect whether the flash fired.
              </p>
              <p className="capture-equipment-note">
                The connector or camera may keep original photos in its own
                storage. VYORA uses the returned JPEG for your strip.
              </p>
            </>
          ) : (
            <p>
              Use continuous lighting with a webcam or video source. A
              video-only connection cannot trigger a camera shutter or external
              flash.
            </p>
          )}
          <p className="capture-equipment-reconnect">
            After changing the capture method or port, return to the preview and
            select <strong>Enable camera</strong>.
          </p>
        </div>
      </div>
    </dialog>
  );
}
