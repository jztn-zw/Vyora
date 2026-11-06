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
}: {
  value: CaptureEquipment;
  disabled: boolean;
  onChange: (value: CaptureEquipment) => void;
}) {
  return (
    <details className="capture-equipment">
      <summary>Capture & lighting</summary>
      <div>
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
        {value.source === 'tethered' ? (
          <>
            <p>
              Open digiCamControl, select a supported camera and enable its web
              server. Use JPEG capture. VYORA connects on this computer.
            </p>
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
                    onChange({ ...value, port: event.target.valueAsNumber });
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
                  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 10)
                    onChange({
                      ...value,
                      recoveryMs: Math.round(seconds * 1000),
                    });
                }}
              />
            </label>
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
            Use continuous lighting with a webcam or video source. A video-only
            connection cannot trigger a camera shutter or external flash.
          </p>
        )}
      </div>
    </details>
  );
}
