import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { SetupGuide } from './setup-guide';
import pinkFriends from './assets/pink-friends-sample.webp';
import urbanPop from './assets/urban-pop-sample.webp';
import urbanPopSmall from './assets/urban-pop-sample-144.webp';
import urbanPopMedium from './assets/urban-pop-sample-220.webp';
import nightIndex from './assets/hero-night-index.webp';
import nightIndexSmall from './assets/hero-night-index-288.webp';
import nightIndexMedium from './assets/hero-night-index-440.webp';
import flashClub from './assets/hero-flash-club.webp';
import flashClubSmall from './assets/hero-flash-club-540.webp';
import flashClubMedium from './assets/hero-flash-club-800.webp';
import boothChronicle from './assets/hero-booth-chronicle.webp';
import boothChronicleSmall from './assets/hero-booth-chronicle-288.webp';
import boothChronicleMedium from './assets/hero-booth-chronicle-440.webp';
import emblem from './assets/vyora-emblem.webp';
import wordmark from './assets/vyora-wordmark.webp';
import sampleCapture from './assets/booth-friends-original.webp';
import captureIllustration from './assets/feature-capture.webp';
import framesIllustration from './assets/feature-frames.webp';
import printIllustration from './assets/feature-print.webp';

const windowsInstallerUrl: string = import.meta.env.VITE_WINDOWS_INSTALLER_URL;

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

function BrandArtwork() {
  return (
    <>
      <img className="brand-emblem" src={emblem} alt="" width="191" height="157" />
      <img className="brand-name" src={wordmark} alt="" width="226" height="65" />
    </>
  );
}

const features = [
  {
    image: captureIllustration,
    title: 'Capture & retake',
    description: 'Start a full-screen session and redo one shot at a time.',
  },
  {
    image: framesIllustration,
    title: 'Choose your frame',
    description: 'Use an included frame or import your own artwork.',
  },
  {
    image: printIllustration,
    title: 'Save & print',
    description: 'Save the strip as a JPEG and print it with a compatible printer.',
  },
] as const;

const sessionSteps = [
  {
    title: 'Pick a frame',
    description: 'Choose an included design or import artwork made for your event.',
  },
  {
    title: 'Start the countdown',
    description: 'See the live preview, get into position, and take the photos.',
  },
  {
    title: 'Review your shots',
    description: 'Keep the photos you like and retake individual shots before confirming.',
  },
  {
    title: 'Keep the finished strip',
    description: 'VYORA saves the JPEG on the booth PC. Open it from My library to print a copy.',
  },
];

// Keep these sizes aligned with the artwork widths in .hero-art and .hero-prints-row.
const portraitSizes =
  '(max-width: 525px) calc(38.7vw - 14px), (max-width: 740px) calc(38.7vw - 18px), (max-height: 960px) min(20vw, 32svh, 295px), min(20vw, 333px)';
const stripSizes =
  '(max-width: 525px) calc(19.35vw - 7px), (max-width: 740px) calc(19.35vw - 9px), (max-height: 960px) min(10vw, 16svh, 148px), min(10vw, 167px)';
const horizontalPrintSizes =
  '(max-width: 525px) calc(75vw - 27px), (max-width: 740px) calc(75vw - 36px), (max-height: 960px) min(41vw, 62svh, 570px), min(43vw, 620px)';

function HeroPrints() {
  const figureRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const images = figureRef.current?.querySelectorAll('img');
    if (!images?.length) return;

    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setReady(true);
    };

    // Give the prints time to decode together without holding them back on a slow connection.
    const timeout = window.setTimeout(reveal, 1200);
    void Promise.allSettled(Array.from(images, (image) => image.decode())).then(() => {
      window.clearTimeout(timeout);
      reveal();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <figure ref={figureRef} className="hero-figure" aria-label="Sample VYORA photo prints">
      <div className="hero-art" data-pending={ready ? undefined : ''}>
        <div className="hero-prints-row">
          <img
            className="hero-print hero-print-night"
            src={nightIndex}
            srcSet={`${nightIndexSmall} 288w, ${nightIndexMedium} 440w, ${nightIndex} 600w`}
            sizes={portraitSizes}
            alt="Night Index, a black editorial VYORA frame with three booth photos"
            width="600"
            height="900"
            decoding="async"
            fetchPriority="high"
          />
          <img
            className="hero-print hero-print-press"
            src={boothChronicle}
            srcSet={`${boothChronicleSmall} 288w, ${boothChronicleMedium} 440w, ${boothChronicle} 600w`}
            sizes={portraitSizes}
            alt="Booth Chronicle, a newsprint VYORA frame with four photos in a grid"
            width="600"
            height="900"
            decoding="async"
            fetchPriority="high"
          />
          <img
            className="hero-print hero-print-strip"
            src={urbanPop}
            srcSet={`${urbanPopSmall} 144w, ${urbanPopMedium} 220w, ${urbanPop} 320w`}
            sizes={stripSizes}
            alt="Four booth photos in the Urban Pop frame with collage and tape details"
            width="320"
            height="960"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <img
          className="hero-print hero-print-club"
          src={flashClub}
          srcSet={`${flashClubSmall} 540w, ${flashClubMedium} 800w, ${flashClub} 1000w`}
          sizes={horizontalPrintSizes}
          alt="Flash Club, a horizontal VYORA sticker frame with three black-and-white photos"
          width="1000"
          height="360"
          decoding="async"
          fetchPriority="high"
        />
      </div>
    </figure>
  );
}

function Home() {
  return (
    <>
      <section className="hero" id="home" aria-labelledby="hero-title">
        <div className="hero-layout page">
          <div className="hero-copy">
            <h1 id="hero-title">Photo booth software</h1>
            <p className="hero-description">
              Run your booth offline. Let guests pick a frame and retake individual shots, then save
              or print the finished strip.
            </p>
            <div className="hero-actions">
              {windowsInstallerUrl ? (
                <a className="button" href={windowsInstallerUrl} download>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />
                  </svg>
                  Download VYORA for Windows
                </a>
              ) : (
                <a className="button" href="/setup">
                  Setup guide <ArrowIcon />
                </a>
              )}
            </div>
          </div>

          <HeroPrints />
        </div>
      </section>
      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="page">
          <h2 id="features-title">From first pose to finished print</h2>
          <ul className="features" role="list">
            {features.map(({ image, title, description }) => (
              <li key={title}>
                <div className="feature-art">
                  <img
                    src={image}
                    alt=""
                    width="780"
                    height="520"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                </div>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="page workflow-section" id="how-it-works" aria-labelledby="workflow-title">
        <div className="workflow-copy">
          <h2 id="workflow-title">What happens at the booth</h2>
          <ol className="workflow-steps">
            {sessionSteps.map(({ title, description }) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="workflow-art">
          <img
            className="workflow-portrait"
            src={sampleCapture}
            alt="Sample black-and-white photo of two friends posing in the booth"
            width="640"
            height="640"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
          <img
            className="workflow-print"
            src={pinkFriends}
            alt="The same friends on a finished Pink Friends photo strip"
            width="320"
            height="960"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
        </div>
      </section>

      <section className="modes-section" id="booth-modes" aria-labelledby="modes-title">
        <div className="page modes-layout">
          <div className="section-heading">
            <p className="eyebrow">BOOTH MODES</p>
            <h2 id="modes-title">Run it yourself or let guests take over</h2>
          </div>
          <div className="modes-list">
            <article>
              <h3>Operator-assisted Studio</h3>
              <p>
                Manage the camera, frames, and retakes from your Windows PC. Open saved strips in My
                library when guests want a print.
              </p>
            </article>
            <article>
              <h3>Full-screen guest booth</h3>
              <p>
                Choose the frames and countdown ahead of time. Guests can start a session, review
                their shots, and hand the booth over to the next group.
              </p>
            </article>
          </div>
          <div className="display-note">
            <div>
              <h3>Add a guest screen</h3>
              <p>
                Keep Studio on your laptop and use a second monitor or a paired browser on the same
                private network for the guest view.
              </p>
            </div>
            <a className="text-link" href="/setup#guest-display">
              Set up a guest display <ArrowIcon />
            </a>
          </div>
        </div>
      </section>

      <section className="page start-section" aria-labelledby="start-title">
        <div className="start-panel">
          <h2 id="start-title">Take a test strip before your event</h2>
          <a className="button button-inverse" href="/setup">
            Open the setup guide <ArrowIcon />
          </a>
        </div>
      </section>
    </>
  );
}

const isSetupPage = window.location.pathname.replace(/\/$/, '') === '/setup';
type HomeSection = 'home' | 'features' | 'how-it-works';

function App() {
  const home = isSetupPage ? '/' : '';
  const setup = isSetupPage ? '' : '/setup';
  const headerRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<HomeSection | undefined>(
    isSetupPage ? undefined : 'home',
  );

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const root = document.documentElement;
    const features = document.getElementById('features');
    const workflow = document.getElementById('how-it-works');
    let headerHeight = 0;
    let frame = 0;
    let lastSection: HomeSection = 'home';

    const updateHeaderHeight = () => {
      headerHeight = header.getBoundingClientRect().height;
      root.style.setProperty('--header-height', `${headerHeight}px`);
    };
    const updateNavigation = () => {
      frame = 0;

      if (features && workflow) {
        const activationLine = headerHeight + Math.min(window.innerHeight * 0.18, 120);
        let section: HomeSection = 'home';
        if (workflow.getBoundingClientRect().top <= activationLine) section = 'how-it-works';
        else if (features.getBoundingClientRect().top <= activationLine) section = 'features';

        if (section !== lastSection) {
          lastSection = section;
          setActiveSection(section);
        }
      }

      header.toggleAttribute('data-scrolled', window.scrollY > 0);
    };
    const scheduleNavigationUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateNavigation);
    };

    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(() => {
      updateHeaderHeight();
      scheduleNavigationUpdate();
    });
    resizeObserver.observe(header);

    // A direct link can arrive before React has rendered its target section.
    const sectionId = window.location.hash.slice(1);
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'instant' });

    updateNavigation();
    window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
    window.addEventListener('resize', scheduleNavigationUpdate);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleNavigationUpdate);
      window.removeEventListener('resize', scheduleNavigationUpdate);
      root.style.removeProperty('--header-height');
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className={isSetupPage ? 'site-header' : 'site-header site-header-home'}
      >
        <svg className="brand-filters" aria-hidden="true" focusable="false">
          <defs>
            <filter
              id="brand-remove-white"
              x="0"
              y="0"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              {/* Subtract the shared RGB component as a white matte. */}
              <feColorMatrix
                in="SourceGraphic"
                values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0"
                result="red"
              />
              <feColorMatrix
                in="SourceGraphic"
                values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0"
                result="green"
              />
              <feColorMatrix
                in="SourceGraphic"
                values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="darken" />
              <feBlend in2="blue" mode="darken" />
              <feColorMatrix
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0"
                result="white-matte"
              />
              <feComposite
                in="SourceGraphic"
                in2="white-matte"
                operator="arithmetic"
                k2="1"
                k3="-1"
              />
            </filter>
          </defs>
        </svg>
        <div className="site-header-inner">
          <a href="/" className="wordmark" aria-label="VYORA home">
            <BrandArtwork />
          </a>
          <nav aria-label="Main navigation">
            <a
              href={isSetupPage ? '/' : '#home'}
              aria-current={activeSection === 'home' ? 'page' : undefined}
            >
              Home
            </a>
            <a
              href={`${home}#features`}
              aria-current={activeSection === 'features' ? 'location' : undefined}
            >
              Features
            </a>
            <a
              href={`${home}#how-it-works`}
              aria-current={activeSection === 'how-it-works' ? 'location' : undefined}
            >
              How it works
            </a>
            <a
              className="button button-compact button-outline"
              href="/setup"
              aria-current={isSetupPage ? 'page' : undefined}
            >
              Setup guide <ArrowIcon />
            </a>
          </nav>
        </div>
      </header>
      <main>{isSetupPage ? <SetupGuide /> : <Home />}</main>
      <footer className="site-footer">
        <div className="page footer-layout">
          <div className="footer-brand">
            <span className="wordmark" role="img" aria-label="VYORA Photobooth">
              <BrandArtwork />
            </span>
            <p>Photo booth software for Windows.</p>
          </div>
          <nav className="footer-nav" aria-label="Footer navigation">
            <div>
              <h2>Explore VYORA</h2>
              <ul role="list">
                <li>
                  <a href={`${home}#features`}>Features</a>
                </li>
                <li>
                  <a href={`${home}#how-it-works`}>How it works</a>
                </li>
                <li>
                  <a href={`${home}#booth-modes`}>Booth modes</a>
                </li>
              </ul>
            </div>
            <div>
              <h2>Setup</h2>
              <ul role="list">
                <li>
                  <a href={`${setup}#quick-start`}>Windows setup</a>
                </li>
                <li>
                  <a href={`${setup}#guest-display`}>Guest display</a>
                </li>
                <li>
                  <a href={`${setup}#printing`}>Printing setup</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </footer>
    </>
  );
}

if (isSetupPage) document.title = 'VYORA · Setup';

const root = createRoot(document.getElementById('root')!);
// Commit the page before the entry script releases its render block.
flushSync(() => root.render(<App />));
