import { useEffect, useRef, useState } from 'react';
import type { GuestStatus } from '@vyora/shared';
import QRCode from 'qrcode';
import { StudioSelect } from './StudioSelect';
import './guest-display.css';

type Configure = (input: {
  displayId?: number;
  tablet?: boolean;
  approve?: string;
  revoke?: string;
  closeDisplay?: boolean;
}) => Promise<void>;
export function GuestDisplayPanel({
  status,
  issue,
  configure,
  onClose,
}: {
  status: GuestStatus | null;
  issue: string;
  configure: Configure;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState('');
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    if (!selected && status?.displays.length)
      setSelected(
        String(
          status.displays.find((item) => !item.primary)?.id ??
            status.displays[0].id,
        ),
      );
  }, [status, selected]);
  useEffect(() => {
    setUrl(status?.urls[0] || '');
  }, [status?.urls.join('|')]);
  useEffect(() => {
    let disposed = false;
    setQr('');
    if (url)
      void QRCode.toDataURL(url, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
      })
        .then((value) => {
          if (!disposed) setQr(value);
        })
        .catch(() => {
          if (!disposed)
            setCopied('Use the address and pairing code to connect.');
        });
    return () => {
      disposed = true;
    };
  }, [url]);
  async function action(input: Parameters<Configure>[0]) {
    setBusy(true);
    try {
      await configure(input);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="guest-manager"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="guest-manager-title"
    >
      <div className="guest-manager-shell">
        <header>
          <div>
            <span className="guest-kicker">STUDIO / GUEST DISPLAY</span>
            <h2 id="guest-manager-title">Guest displays</h2>
            <p>Keep the controls here. Let your guests enjoy the booth.</p>
          </div>
          <button className="outline-button" onClick={onClose}>
            Close
          </button>
        </header>
        {issue && (
          <p className="guest-notice" role="alert">
            {issue}
          </p>
        )}
        <div className="guest-connection-grid">
          <section>
            <h3>Connected monitor</h3>
            <p>
              Connect a monitor and choose Extend in Windows display settings.
            </p>
            <StudioSelect
              label="Guest monitor"
              value={selected}
              onChange={setSelected}
              disabled={busy}
              options={(status?.displays || []).map((item) => ({
                value: String(item.id),
                label: item.label,
                description: item.primary
                  ? 'Primary display · preview only'
                  : 'Extended guest display',
              }))}
            />
            <div className="guest-buttons">
              <button
                className="primary-button"
                disabled={busy || !selected}
                onClick={() => void action({ displayId: Number(selected) })}
              >
                Open guest screen
              </button>
              {status?.displayId != null && (
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => void action({ closeDisplay: true })}
                >
                  Close screen
                </button>
              )}
            </div>
            {status?.displays.length === 1 && (
              <p className="guest-small">
                Only one display is detected. You can preview the guest window,
                or connect a second monitor to keep both screens visible.
              </p>
            )}
          </section>
          <section>
            <h3>Guest devices</h3>
            <p>
              Open the guest booth in a browser on another device using the same
              private Wi-Fi or hotspot. No app installation is needed.
            </p>
            <button
              className={status?.tablet ? 'outline-button' : 'primary-button'}
              disabled={busy}
              onClick={() => void action({ tablet: !status?.tablet })}
            >
              {status?.tablet
                ? 'Stop device connection'
                : 'Enable device pairing'}
            </button>
            {status?.tablet && (
              <>
                <div className="guest-pairing-details">
                  {qr && (
                    <img
                      src={qr}
                      alt="Scan this QR code on your guest device"
                    />
                  )}
                  <div>
                    <strong>Pairing code</strong>
                    <p className="guest-code">{status.pairingCode}</p>
                    <p>
                      Scan, connect, then approve the device below. New pairings
                      expire after 10 minutes; connected devices stay paired.
                    </p>
                  </div>
                </div>
                {status.urls.length > 1 && (
                  <StudioSelect
                    label="Computer network"
                    value={url}
                    onChange={setUrl}
                    options={status.urls.map((value) => ({
                      value,
                      label: new URL(value).host,
                    }))}
                  />
                )}
                {url ? (
                  <>
                    <p className="guest-address">{url.split('#')[0]}</p>
                    <button
                      className="outline-button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(url)
                          .then(() => setCopied('Pairing link copied.'))
                          .catch(() =>
                            setCopied(
                              'Use the address and pairing code shown here.',
                            ),
                          );
                      }}
                    >
                      Copy pairing link
                    </button>
                    <p role="status">{copied}</p>
                  </>
                ) : (
                  <p>
                    Connect the main computer to Wi-Fi or enable a hotspot, then
                    restart device pairing.
                  </p>
                )}
                <p className="guest-small">
                  Use a network you trust. Windows may ask you to allow VYORA on
                  private networks. The device receives a live preview; original
                  photo quality is preserved on the main computer.
                </p>
              </>
            )}
          </section>
        </div>
        {!!status?.devices.length && (
          <section className="guest-devices">
            <h3>Guest devices</h3>
            {status.devices.map((device) => (
              <div key={device.id}>
                <span>
                  <strong>{device.name}</strong>
                  <small>
                    {device.approved
                      ? device.connected
                        ? 'Connected'
                        : 'Disconnected · waiting to reconnect'
                      : 'Waiting for your approval'}
                  </small>
                </span>
                {!device.approved && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void action({ approve: device.id })}
                  >
                    Approve
                  </button>
                )}
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => void action({ revoke: device.id })}
                >
                  {device.approved ? 'Disconnect' : 'Decline'}
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </dialog>
  );
}
