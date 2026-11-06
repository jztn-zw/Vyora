export function SetupGuide() {
  return (
    <>
      <header className="guide-banner">
        <div className="page guide-heading">
          <p className="eyebrow">WINDOWS SETUP GUIDE</p>
          <h1>
            Set up your <em>first booth</em>
          </h1>
          <p>
            Start with a Windows 10 or 11 PC and a camera recognized by Windows. Add a guest screen
            or printer once you’ve saved a test strip.
          </p>
        </div>
      </header>

      <div className="page guide-layout">
        <nav className="guide-nav" aria-label="Setup guide sections">
          <p className="eyebrow">ON THIS PAGE</p>
          <a href="#quick-start">Save a test strip</a>
          <a href="#guest-display">Set up a guest display</a>
          <a href="#printing">Print a strip</a>
        </nav>

        <div className="guide-content">
          <section id="quick-start" aria-labelledby="quick-start-title">
            <h2 id="quick-start-title">Save a test strip</h2>
            <ol className="guide-steps">
              <li>
                <h3>Install and open VYORA</h3>
                <p>
                  Run the Windows installer supplied with your VYORA build and follow the setup
                  wizard. If it’s already installed, open VYORA from the Start menu.
                </p>
              </li>
              <li>
                <h3>Connect a camera</h3>
                <p>
                  Connect a built-in or USB webcam that Windows can see. Select it in Studio, choose{' '}
                  <strong>Enable camera</strong>, and check the live preview.
                </p>
              </li>
              <li>
                <h3>Choose a frame and take photos</h3>
                <p>
                  Set your countdown and frame, then start a test session. In review, select any
                  individual shots you want to retake.
                </p>
              </li>
              <li>
                <h3>Save and open the result</h3>
                <p>
                  Choose <strong>Confirm &amp; save strip</strong>. VYORA keeps the JPEG on your PC
                  and lists it in <strong>My library</strong>.
                </p>
              </li>
            </ol>
          </section>

          <section id="guest-display" aria-labelledby="guest-display-title">
            <h2 id="guest-display-title">Set up a guest display</h2>
            <div className="guide-options">
              <div>
                <h3>Connected monitor</h3>
                <p>
                  Set Windows to <strong>Extend these displays</strong>. In VYORA, open{' '}
                  <strong>Guest booth → Display settings</strong>, select the monitor, and choose{' '}
                  <strong>Open guest screen</strong>.
                </p>
              </div>
              <div>
                <h3>Tablet or another computer</h3>
                <p>
                  Connect both devices to the same private Wi-Fi or hotspot. In{' '}
                  <strong>Display settings</strong>, enable tablet pairing. Open the displayed
                  address on the guest device, enter the pairing code, and approve it in Studio.
                </p>
              </div>
            </div>
            <p className="guide-note">
              For self-service, use <strong>Guest booth → Set up booth</strong> to select guest
              frames and timing, then choose <strong>Start full-screen booth</strong>.
            </p>
          </section>

          <section id="printing" aria-labelledby="printing-title">
            <h2 id="printing-title">Print a strip</h2>
            <ol className="guide-steps">
              <li>
                <h3>Select a printer</h3>
                <p>
                  Install your printer and its Windows driver. Open{' '}
                  <strong>Tools → Printer settings</strong> in VYORA and select the printer.
                </p>
              </li>
              <li>
                <h3>Match the paper and layout</h3>
                <p>
                  Choose one 2 × 6-inch strip on compatible media, two strips on a 4 × 6-inch sheet,
                  or <strong>Full sheets</strong> for supported larger paper. Match the paper size
                  in the Windows printer driver.
                </p>
              </li>
              <li>
                <h3>Test the physical print</h3>
                <p>
                  Open a saved strip and choose <strong>Print strip</strong> for photo-printer
                  layouts. For full sheets, choose <strong>Add to sheet</strong> and arrange the
                  paper before sending the job. Check the result before the event.
                </p>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
