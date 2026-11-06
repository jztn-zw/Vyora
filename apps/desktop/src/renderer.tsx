import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestDisplayPanel } from './GuestDisplayPanel';
import { GuestBoothControls } from './GuestBoothControls';
import { useGuestController } from './use-guest-controller';
import { version as appVersion } from '../package.json';
import type {
  CaptureTimer,
  LibraryInfo,
  PhotoRecord,
  StripRecord,
  AppTheme,
  StripTemplate,
  StripTemplateSummary,
  PhotoEffect,
} from '@vyora/shared';
import { isAppTheme, saveTheme, themes } from './theme';
import { renderStripJpeg, stripPreviewUrl } from './photo-strip';
import boothFriends from './assets/booth-friends.png';
import { TetheredCameraController } from './tethered-camera-controller';
import { CameraCaptureSettings } from './CameraCaptureSettings';
import type { CaptureEquipment } from './CameraCaptureSettings';
import './style.css';
import './kiosk-mode.css';
import '@vyora/shared/brand.css';
import './theme.css';
import './studio-tools.css';
import { CameraHelp } from './CameraHelp';
import { PrinterSettings } from './PrinterSettings';
import { PaperManager } from './PaperManager';
import { TemplateEditor } from './TemplateEditor';
import { TemplateRemoveDialog } from './TemplateRemoveDialog';
import { StripViewer } from './StripViewer';
import { StudioSelect } from './StudioSelect';
import { CaptureReview } from './CaptureReview';
import { CaptureShotRail } from './CaptureShotRail';
import { CaptureCountdown } from './CaptureCountdown';
import { KioskStartSurface } from './KioskStartSurface';
import { isPhotoEffect } from './photo-effects';
import { DeleteStripDialog } from './DeleteStripDialog';
import { ExitBoothDialog } from './ExitBoothDialog';
import { NoticeGate, UsageNoticeDialog } from './UsageNotice';
import { FramePreview } from './FramePreview';
import { FrameCarousel } from './FrameCarousel';
import {
  frameChoiceId,
  frameChoiceName,
  groupFrameChoices,
  normalizeFrameChoices,
  resolveFrameChoice,
} from './frame-choices';
import { retakeTargets } from './capture-review';
import type { CaptureTarget } from './capture-review';
import './controls.css';
import './inputs.css';

function Icon({
  name,
  size = 20,
}: {
  name:
    | 'camera'
    | 'grid'
    | 'folder'
    | 'arrow'
    | 'check'
    | 'spark'
    | 'lock'
    | 'clock'
    | 'refresh'
    | 'chevron'
    | 'help'
    | 'printer'
    | 'more'
    | 'power'
    | 'exit';
  size?: number;
}) {
  const paths = {
    exit: (
      <>
        <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
        <path d="M10 17l5-5-5-5M15 12H3" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
    printer: (
      <>
        <path d="M7 8V3h10v5M7 17H4V9h16v8h-3" />
        <path d="M7 14h10v7H7zM16 11h1" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h4l2-3h4l2 3h4v13H4z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    folder: <path d="M3 6h7l2 3h9v11H3z" />,
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    spark: (
      <path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" />
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 6a8 8 0 0 1 13 3M17.9 18a8 8 0 0 1-13-3" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2-2.5 4" />
        <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v9M7 5a8 8 0 1 0 10 0" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Session cancelled', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

const themeNames = { light: 'Light', dark: 'Dark', vyora: 'VYORA' };
const themeDescriptions = {
  light: 'A bright, clean workspace',
  dark: 'A softer studio after hours',
  vyora: 'Our signature purple & pink',
};

function ThemePicker({
  theme,
  onChange,
}: {
  theme: AppTheme;
  onChange: (value: AppTheme) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <details
      className="theme-picker"
      name="topbar-menus"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current) {
          menu.current.open = false;
          menu.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label={`Appearance: ${themeNames[theme]}`}
        title="Change appearance"
      >
        <span className={`theme-dot theme-dot-${theme}`} aria-hidden="true" />
        <span>{themeNames[theme]}</span>
        <Icon name="chevron" size={13} />
      </summary>
      <div className="theme-menu" role="group" aria-label="Appearance">
        <p>MAKE YOURSELF AT HOME</p>
        {themes.map((value) => (
          <button
            key={value}
            aria-pressed={theme === value}
            onClick={() => {
              onChange(value);
              if (menu.current) {
                menu.current.open = false;
                menu.current.querySelector('summary')?.focus();
              }
            }}
          >
            <span
              className={`theme-sample theme-sample-${value}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
            </span>
            <span className="theme-choice-copy">
              <strong>{themeNames[value]}</strong>
              <small>{themeDescriptions[value]}</small>
            </span>
            {theme === value && <Icon name="check" size={15} />}
          </button>
        ))}
        <span className="theme-menu-note">
          Your choice is remembered on this device.
        </span>
      </div>
    </details>
  );
}

function StudioTools({
  running,
  onPrinter,
  onPaper,
  onFolder,
  onNotice,
}: {
  running: boolean;
  onPrinter: () => void;
  onPaper: () => void;
  onFolder: () => void;
  onNotice: () => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function choose(action: () => void) {
    if (root.current) {
      root.current.open = false;
      root.current.querySelector('summary')?.focus();
    }
    action();
  }
  return (
    <details
      ref={root}
      className="studio-tools"
      name="topbar-menus"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && root.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          root.current.open = false;
          root.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary title="Studio tools" aria-label="Studio tools">
        <Icon name="more" size={18} />
      </summary>
      <div className="studio-tools-menu" role="group" aria-label="Studio tools">
        <p>Studio tools</p>
        <button
          type="button"
          disabled={running}
          onClick={() => choose(onPrinter)}
        >
          <Icon name="printer" size={19} />
          <span>
            <strong>Printer settings</strong>
            <small>Choose your printer and print mode</small>
          </span>
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => choose(onPaper)}
        >
          <Icon name="grid" size={19} />
          <span>
            <strong>Paper & layout</strong>
            <small>Arrange strips and manage your queue</small>
          </span>
        </button>
        <div className="studio-tools-divider" />
        <button type="button" onClick={() => choose(onFolder)}>
          <Icon name="folder" size={19} />
          <span>
            <strong>Strip folder</strong>
            <small>Open your saved strips in File Explorer</small>
          </span>
          <Icon name="arrow" size={14} />
        </button>
        <button type="button" onClick={() => choose(onNotice)}>
          <Icon name="help" size={19} />
          <span>
            <strong>Terms & privacy</strong>
            <small>Testing terms and local photo storage</small>
          </span>
        </button>
      </div>
    </details>
  );
}

function StripCard({
  strip,
  onView,
  onDelete,
  pending = false,
}: {
  strip: StripRecord;
  onView: () => void;
  onDelete?: () => void;
  pending?: boolean;
}) {
  const preview = useMemo(
    () => strip.preview || stripPreviewUrl(strip),
    [strip],
  );
  return (
    <article className="strip-card">
      <button
        type="button"
        className="strip-card-preview"
        onClick={onView}
        aria-label={`View ${strip.photos.length}-photo strip captured ${new Date(strip.createdAt).toLocaleString()}`}
      >
        <img
          src={preview}
          loading="lazy"
          decoding="async"
          alt={`VYORA photo strip with ${strip.photos.length} photos, captured ${new Date(strip.createdAt).toLocaleString()}`}
        />
        <span className="strip-view-hint">
          View strip <Icon name="arrow" size={14} />
        </span>
      </button>
      <div className="strip-card-details">
        <div>
          <strong>{strip.photos.length} photos</strong>
          <span>
            {pending
              ? 'Not saved yet'
              : new Date(strip.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
          </span>
        </div>
        {!pending && onDelete && (
          <button
            type="button"
            className="strip-delete-button"
            onClick={onDelete}
            aria-label={`Delete strip captured ${new Date(strip.createdAt).toLocaleString()}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

function App() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const initial = document.documentElement.dataset.theme;
    return isAppTheme(initial) ? initial : 'light';
  });
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<AbortController | null>(null);
  const cameraPicker = useRef<HTMLDetailsElement>(null);
  const [camera] = useState(() => {
    const controller = new TetheredCameraController(
      navigator.mediaDevices,
      () => video.current,
      {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      () => session.current?.abort(),
      window.vyora,
    );
    try {
      const saved = JSON.parse(
        localStorage.getItem('vyora.capture-equipment') || 'null',
      );
      if (saved?.source === 'tethered') controller.setSource('tethered');
      if (
        Number.isInteger(saved?.port) &&
        saved.port >= 1024 &&
        saved.port <= 65535
      )
        controller.port = saved.port;
      if (
        Number.isInteger(saved?.recoveryMs) &&
        saved.recoveryMs >= 0 &&
        saved.recoveryMs <= 10000
      )
        controller.recoveryMs = saved.recoveryMs;
    } catch {
      /* Use webcam defaults if settings are unavailable. */
    }
    return controller;
  });
  const [equipment, setEquipment] = useState<CaptureEquipment>(() => ({
    source: camera.source,
    port: camera.port,
    recoveryMs: camera.recoveryMs,
  }));
  function configureEquipment(value: CaptureEquipment) {
    if (session.current || pendingStrip || exportingStrip) return;
    if (value.source !== camera.source || value.port !== camera.port)
      camera.setSource(value.source);
    camera.port = value.port;
    camera.recoveryMs = value.recoveryMs;
    setEquipment(value);
    try {
      localStorage.setItem('vyora.capture-equipment', JSON.stringify(value));
    } catch {
      /* Settings remain available for this session. */
    }
    if (value.source === 'webcam') void camera.refresh();
  }
  const [cameraState, setCameraState] = useState(camera.state);
  const {
    devices,
    deviceId,
    cameraError,
    cameraLabel,
    cameraResolution,
    scanning,
  } = cameraState;
  const ready = cameraState.status === 'ready';
  const connecting = cameraState.status === 'connecting';
  const [tab, setTab] = useState<'capture' | 'library'>('capture');
  const [organizerSetup, setOrganizerSetup] = useState(false);
  const [kioskFrameIds, setKioskFrameIds] = useState<string[]>(['']);
  const [kioskMode, setKioskMode] = useState(false);
  const [guestMode, setGuestMode] = useState<'assisted' | 'self-service'>(
    'assisted',
  );
  const [guestPaused, setGuestPaused] = useState(false);
  const [guestDone, setGuestDone] = useState(false);
  const [confirmExitBooth, setConfirmExitBooth] = useState(false);
  const [showUsageNotice, setShowUsageNotice] = useState(false);
  const [kioskStage, setKioskStage] = useState<'design' | 'capture' | 'done'>(
    'design',
  );
  const [kioskStripPreview, setKioskStripPreview] = useState('');
  const [settingsView, setSettingsView] = useState<'capture' | 'frame'>(
    'capture',
  );
  const [library, setLibrary] = useState<LibraryInfo | null>(null);
  const libraryRequest = useRef(0);
  const [running, setRunning] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [captureGoal, setCaptureGoal] = useState(4);
  const [activePhoto, setActivePhoto] = useState(1);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [photoEffect, setPhotoEffect] = useState<PhotoEffect>('original');
  const [timer, setTimer] = useState<CaptureTimer>(() => {
    try {
      const saved = Number(localStorage.getItem('vyora.kiosk-countdown'));
      if (saved === 3 || saved === 5 || saved === 10)
        return saved as CaptureTimer;
    } catch {
      /* Use the standard countdown if local preferences are unavailable. */
    }
    return 3;
  });
  const shots = 4;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [capturedSlots, setCapturedSlots] = useState<number[]>([]);
  const [capturePhotos, setCapturePhotos] = useState<
    (PhotoRecord | undefined)[]
  >([]);
  const [message, setMessage] = useState('Your photos stay on this computer.');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);
  const [exportingStrip, setExportingStrip] = useState('');
  const savingStrip = useRef(false);
  const [pendingStrip, setPendingStrip] = useState<StripRecord | null>(null);
  const [templates, setTemplates] = useState<StripTemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<StripTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [editingExistingTemplate, setEditingExistingTemplate] =
    useState<StripTemplate>();
  const [removingTemplate, setRemovingTemplate] = useState<Pick<
    StripTemplate,
    'id' | 'name'
  > | null>(null);
  const [showCameraHelp, setShowCameraHelp] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showPaperManager, setShowPaperManager] = useState(false);
  const [printerRevision, setPrinterRevision] = useState(0);
  const [viewingStrip, setViewingStrip] = useState<StripRecord | null>(null);
  const [deletingStrip, setDeletingStrip] = useState<StripRecord | null>(null);
  const templateRequest = useRef(0);
  const visibleStrips = [
    ...(pendingStrip ? [pendingStrip] : []),
    ...(library?.strips ?? []),
  ];
  const activeStrip =
    viewingStrip &&
    (visibleStrips.find((strip) => strip.id === viewingStrip.id) ??
      viewingStrip);
  const selectedCamera = devices.find((device) => device.deviceId === deviceId);
  const sequenceLength =
    pendingStrip?.template?.slots.length ??
    Math.max(shots, pendingStrip?.photos.length ?? 0);
  const completedSlots = pendingStrip
    ? pendingStrip.photos.map((_, index) => index)
    : capturedSlots;

  function rememberTemplate(id: string) {
    try {
      localStorage.setItem('vyora.strip-template', id);
    } catch {
      /* Templates still work if preference storage is unavailable. */
    }
  }
  const studioFrameChoices = useMemo(
    () => groupFrameChoices(templates, shots),
    [templates, shots],
  );
  const olderCustomFrames = templates.filter(
    (template) => !template.builtIn && template.slots.length !== shots,
  );

  async function chooseTemplate(id: string) {
    if (session.current || pendingStrip) return false;
    const attempt = ++templateRequest.current;
    setLoadingTemplate(true);
    try {
      if (!id) {
        setSelectedTemplate(null);
        rememberTemplate('');
        setProgress(0);
        return true;
      }
      const variant = resolveFrameChoice(templates, id, shots);
      if (!variant) throw new Error('Choose a frame with 4 photo areas.');
      const result = await window.vyora.getTemplate(variant.id);
      if (attempt !== templateRequest.current) return false;
      if (!result.ok) throw new Error(result.error);
      setSelectedTemplate(result.value);

      setProgress(0);
      rememberTemplate(variant.id);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load this template.',
      );
      return false;
    } finally {
      if (attempt === templateRequest.current) setLoadingTemplate(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.vyora.listTemplates();
        if (cancelled) return;
        if (!result.ok) throw new Error(result.error);
        setTemplates(result.value);
        const availableFrameIds = [
          '',
          ...groupFrameChoices(result.value, shots).map((item) => item.id),
        ];
        let rememberedFrames: string[] = [];
        try {
          const saved = JSON.parse(
            localStorage.getItem('vyora.kiosk-frames') || 'null',
          );
          if (Array.isArray(saved))
            rememberedFrames = normalizeFrameChoices(saved, result.value);
        } catch {
          /* Use all local frames when saved booth settings are unavailable. */
        }
        setKioskFrameIds(
          rememberedFrames.length ? rememberedFrames : availableFrameIds,
        );
        let remembered = '';
        try {
          remembered = localStorage.getItem('vyora.strip-template') || '';
        } catch {
          /* Use the default frame. */
        }
        const rememberedFrame = resolveFrameChoice(
          result.value,
          remembered,
          shots,
        );
        if (rememberedFrame) {
          const selected = await window.vyora.getTemplate(rememberedFrame.id);
          if (cancelled) return;
          if (selected.ok) {
            setSelectedTemplate(selected.value);
          } else setError(selected.error);
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load templates.',
          );
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function templateSaved(template: StripTemplate) {
    setSelectedTemplate(template);

    setProgress(0);
    rememberTemplate(template.id);
    setEditingTemplate(false);
    setEditingExistingTemplate(undefined);
    setKioskFrameIds((current) => {
      const next = current.includes(template.id)
        ? current
        : [...current, template.id];
      try {
        localStorage.setItem('vyora.kiosk-frames', JSON.stringify(next));
      } catch {
        /* Booth setup remains available for this session. */
      }
      return next;
    });
    setMessage(`“${template.name}” is ready for your next session.`);
    const result = await window.vyora.listTemplates();
    if (result.ok) setTemplates(result.value);
    else setError(result.error);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(
      { setItem: (key, value) => localStorage.setItem(key, value) },
      theme,
    );
    void window.vyora.setTheme?.(theme).catch(() => {
      /* The page remains themed if native chrome is unavailable. */
    });
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('vyora.kiosk-countdown', String(timer));
    } catch {
      /* Booth settings remain usable until the application closes. */
    }
  }, [timer]);

  const refreshLibrary = useCallback(async () => {
    const request = ++libraryRequest.current;
    try {
      const result = await window.vyora.getLibrary();
      if (request !== libraryRequest.current) return;
      if (result.ok) {
        setLibrary(result.value);
        setPendingStrip(result.value.pendingStrip ?? null);
        setViewingStrip((current) =>
          current &&
          (result.value.strips.some((strip) => strip.id === current.id) ||
            result.value.pendingStrip?.id === current.id)
            ? current
            : null,
        );
      } else setError(result.error);
    } catch {
      if (request === libraryRequest.current)
        setError(
          'Could not refresh the local library. Check folder permissions and try again.',
        );
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
    return () => {
      session.current?.abort();
    };
  }, [refreshLibrary]);
  useEffect(() => {
    const refreshWhenIdle = () => {
      if (
        !session.current &&
        !savingStrip.current &&
        document.visibilityState === 'visible'
      )
        void refreshLibrary();
    };
    window.addEventListener('focus', refreshWhenIdle);
    document.addEventListener('visibilitychange', refreshWhenIdle);
    return () => {
      window.removeEventListener('focus', refreshWhenIdle);
      document.removeEventListener('visibilitychange', refreshWhenIdle);
    };
  }, [refreshLibrary]);
  const refreshCameras = useCallback(() => camera.refresh(), [camera]);

  useEffect(() => {
    const unsubscribe = camera.subscribe(setCameraState);
    void refreshCameras();
    const update = () => {
      void refreshCameras();
    };
    navigator.mediaDevices.addEventListener('devicechange', update);
    return () => {
      unsubscribe();
      camera.dispose();
      navigator.mediaDevices.removeEventListener('devicechange', update);
    };
  }, [camera, refreshCameras]);

  useEffect(() => {
    const closePicker = (event: PointerEvent) => {
      if (
        cameraPicker.current &&
        !cameraPicker.current.contains(event.target as Node)
      ) {
        cameraPicker.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, []);

  function disconnectCamera() {
    camera.off();
    setMessage('Camera is off. Enable it whenever you are ready.');
  }

  async function connectCamera(selectedId?: string) {
    if (session.current) return;
    await camera.connect(selectedId);
    if (camera.canCapture())
      setMessage('Camera ready. Your next good memory is one click away.');
  }
  async function startSession(selection?: string[] | 'remaining') {
    if (
      !ready ||
      connecting ||
      !!exportingStrip ||
      savingStrip.current ||
      (selection ? !pendingStrip : !!pendingStrip) ||
      loadingTemplate ||
      guestPaused ||
      editingTemplate ||
      session.current ||
      !camera.canCapture()
    )
      return;
    const previous = pendingStrip;
    const retakeIds = Array.isArray(selection) ? selection : undefined;
    let targets: CaptureTarget[];
    try {
      const firstMissing = previous?.photos.length ?? 0;
      targets =
        previous && retakeIds
          ? retakeTargets(previous, retakeIds)
          : Array.from({ length: shots - firstMissing }, (_, offset) => ({
              index: firstMissing + offset,
              photoId: undefined,
            }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Choose photos to retake.',
      );
      return;
    }
    if (!targets.length) return;
    if (!previous) setPhotoEffect('original');
    setGuestDone(false);
    const controller = new AbortController();
    const sessionId = previous?.id ?? crypto.randomUUID();
    session.current = controller;
    setRunning(true);
    setRetaking(!!retakeIds);
    setCaptureGoal(targets.length);
    setActivePhoto(targets[0].index + 1);
    setReviewOpen(false);
    setTab('capture');
    setProgress(0);
    setError('');
    setCapturedSlots(previous ? previous.photos.map((_, index) => index) : []);
    const captured: PhotoRecord[] = previous ? [...previous.photos] : [];
    setCapturePhotos([...captured]);
    let completed = 0;
    const sessionTemplate = previous
      ? previous.template
      : (selectedTemplate ?? undefined);
    // Reuse the backing buffer throughout a sequence instead of allocating one
    // full-resolution canvas per shot and waiting for garbage collection.
    const canvas = document.createElement('canvas');
    try {
      for (let shot = 0; shot < targets.length; shot++) {
        const target = targets[shot];
        setActivePhoto(target.index + 1);
        setMessage(
          retakeIds
            ? `Retaking photo ${target.index + 1} · ${shot + 1} of ${targets.length} selected.`
            : `Get ready for photo ${target.index + 1} of ${shots}.`,
        );
        const recovery = camera.remainingRecovery();
        if (recovery > 0) {
          setMessage('Preparing the camera and lighting for the next photo…');
          await wait(recovery, controller.signal);
        }
        const deadline = Date.now() + timer * 1000;
        setCountdown(timer);
        setCountdownEndsAt(deadline);
        await wait(Math.max(0, deadline - Date.now()), controller.signal);
        setCountdown(null);
        setCountdownEndsAt(null);
        const element = video.current;
        if (!element || !camera.canCapture())
          throw new Error('Camera preview is not ready. Reconnect the camera.');
        let native: ImageBitmap | null = null;
        try {
          if (camera.source === 'tethered') {
            setMessage(
              `Taking photo ${target.index + 1}. Hold your pose while the camera transfers it.`,
            );
            const bytes = await camera.captureNative(controller.signal);
            native = await createImageBitmap(
              new Blob([bytes], { type: 'image/jpeg' }),
            );
          }
          const width = native?.width ?? element.videoWidth;
          const height = native?.height ?? element.videoHeight;
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not prepare the photo.');
          context.save();
          // Keep the preview's mirror orientation in the captured photo.
          if (mirror) {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
          }
          context.drawImage(native ?? element, 0, 0);
          context.restore();
        } finally {
          native?.close();
        }
        setFlash(true);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error('Could not encode the photo.')),
            'image/jpeg',
            0.94,
          ),
        );
        const jpeg = await blob.arrayBuffer();
        controller.signal.throwIfAborted();
        if (!camera.canCapture())
          throw new Error(
            'Camera feed interrupted. Reconnect before taking more photos.',
          );
        const result = target.photoId
          ? await window.vyora.replacePhoto(jpeg, sessionId, target.photoId)
          : await window.vyora.stagePhoto(jpeg, sessionId, sessionTemplate?.id);
        setFlash(false);
        if (!result.ok) throw new Error(result.error);
        captured[target.index] = result.value;
        setCapturePhotos([...captured]);
        setCapturedSlots((current) =>
          current.includes(target.index) ? current : [...current, target.index],
        );
        completed++;
        setProgress(completed);
        if (shot < targets.length - 1) await wait(650, controller.signal);
      }
      setMessage(
        retakeIds
          ? 'Retakes ready. Review your photos before saving.'
          : `${captured.length} photos ready. Review them before saving.`,
      );
    } catch (cause) {
      if (controller.signal.aborted)
        setMessage(
          captured.length
            ? retakeIds
              ? 'Retakes stopped. Review your current photos before saving.'
              : `Session stopped. Review your ${captured.length} captured photo${captured.length === 1 ? '' : 's'}.`
            : 'Session stopped before any photos were captured.',
        );
      else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Capture failed. Your captured photos are still available for review.',
        );
    } finally {
      canvas.width = canvas.height = 0;
      setCountdown(null);
      setCountdownEndsAt(null);
      setFlash(false);
      if (captured.length) {
        setPendingStrip({
          id: sessionId,
          createdAt: previous?.createdAt ?? captured[0].createdAt,
          photos: captured,
          template: sessionTemplate,
        });
        setReviewOpen(true);
      }
      setRunning(false);
      session.current = null;
    }
  }

  async function exportStrip(id: string) {
    setExportingStrip(id);
    try {
      const sources = await window.vyora.getStripSources(id);
      if (!sources.ok) throw new Error(sources.error);
      const jpeg = await renderStripJpeg(
        sources.value,
        pendingStrip?.id === id ? photoEffect : undefined,
      );
      const result = await window.vyora.saveStrip(id, jpeg);
      if (!result.ok) throw new Error(result.error);
      if (pendingStrip?.id === id) {
        setCapturedSlots([]);
        setCapturePhotos([]);
        setProgress(0);
        setRetaking(false);
        setActivePhoto(1);
        setCaptureGoal(shots);
      }
      setPendingStrip((pending) => (pending?.id === id ? null : pending));
      await refreshLibrary();
    } finally {
      setExportingStrip('');
    }
  }

  async function saveStrip(id: string, confirmed = false) {
    if (session.current || savingStrip.current) return false;
    if (pendingStrip?.id === id && !confirmed) {
      setReviewOpen(true);
      return false;
    }
    savingStrip.current = true;
    setError('');
    try {
      if (!library?.strips.find((strip) => strip.id === id)?.preview)
        await exportStrip(id);
      setMessage('Your confirmed photo strip is saved. A little moment, kept.');
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save the strip. Keep this window open and retry.',
      );
      return false;
    } finally {
      savingStrip.current = false;
    }
  }
  async function confirmReview() {
    if (!pendingStrip || session.current || exportingStrip) return false;
    if (pendingStrip.photos.length !== shots) return false;
    const confirmed = pendingStrip;
    const saved = await saveStrip(pendingStrip.id, true);
    if (saved) {
      setReviewOpen(false);
      if (kioskMode || guestMode === 'self-service') {
        setGuestDone(true);
        try {
          const preview = await window.vyora.getStripPreview(confirmed.id);
          setKioskStripPreview(
            preview.ok
              ? preview.value
              : stripPreviewUrl(confirmed, photoEffect),
          );
        } catch {
          setKioskStripPreview(stripPreviewUrl(confirmed, photoEffect));
        }
        setKioskStage('done');
      } else {
        setGuestDone(false);
        setKioskStripPreview('');
        if (guest.active) {
          setKioskStage('capture');
          if (!camera.canCapture()) void connectCamera();
        } else setViewingStrip(confirmed);
      }
    }
    return saved;
  }

  function openBoothSetup() {
    if (running || pendingStrip || editingTemplate || exportingStrip) return;
    setTab('capture');
    setOrganizerSetup(true);
    setError('');
  }

  function toggleKioskFrame(id: string) {
    setKioskFrameIds((current) => {
      const next = current.includes(id)
        ? current.filter((frameId) => frameId !== id)
        : [...current, id];
      try {
        localStorage.setItem('vyora.kiosk-frames', JSON.stringify(next));
      } catch {
        /* Booth setup remains available for this session. */
      }
      return next;
    });
  }

  function enterKiosk() {
    if (
      running ||
      pendingStrip ||
      editingTemplate ||
      exportingStrip ||
      !kioskFrameIds.length
    )
      return;
    setOrganizerSetup(false);
    setTab('capture');
    setKioskStripPreview('');
    setKioskStage('design');
    setGuestMode('self-service');
    setGuestDone(false);
    setGuestPaused(false);
    setKioskMode(true);
    setError('');
    void document.documentElement.requestFullscreen?.().catch(() => {
      /* Kiosk mode remains usable when fullscreen is unavailable. */
    });
    void (async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!camera.canCapture()) await connectCamera();
    })();
  }

  function exitKiosk() {
    if (running || exportingStrip) return;
    camera.off();
    setKioskMode(false);
    setGuestMode('assisted');
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {
        /* The studio view remains available if fullscreen cannot close. */
      });
  }

  async function startKioskTemplate(id: string) {
    setError('');
    if (!(await chooseTemplate(id))) return;
    setKioskStage('capture');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (!ready) await connectCamera();
  }

  function finishKioskSession() {
    if (running || pendingStrip) return;
    setKioskStripPreview('');
    setGuestDone(false);
    setKioskStage('design');
    if (!camera.canCapture()) void connectCamera();
    setMessage('Your photos stay on this computer.');
  }

  const guestFrames = useMemo(() => {
    const choices = [
      ...(kioskFrameIds.includes('')
        ? [{ id: '', name: 'Doodle No. 01', template: undefined }]
        : []),
      ...studioFrameChoices.filter((choice) =>
        kioskFrameIds.includes(choice.id),
      ),
    ];
    return choices.map((choice) => ({
      id: choice.id,
      name: choice.name,
      shots: choice.template?.slots.length ?? shots,
      preview:
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
          renderToStaticMarkup(
            <FramePreview template={choice.template} shots={shots} />,
          ),
        ),
    }));
  }, [studioFrameChoices, kioskFrameIds, shots]);
  const guestStrip = useMemo(
    () =>
      pendingStrip
        ? stripPreviewUrl(pendingStrip, photoEffect)
        : kioskStripPreview,
    [pendingStrip, photoEffect, kioskStripPreview],
  );
  const guestStage = running
    ? 'capture'
    : pendingStrip
      ? 'review'
      : guestMode === 'self-service' && guestDone
        ? 'done'
        : guestMode === 'self-service' && kioskStage === 'design'
          ? 'design'
          : 'ready';
  const guest = useGuestController(
    {
      theme,
      mode: guestMode,
      stage: guestStage,
      ready,
      busy:
        !!exportingStrip ||
        loadingTemplate ||
        editingTemplate ||
        organizerSetup ||
        (reviewOpen && guestMode === 'self-service' && !kioskMode),
      paused: guestPaused,
      mirror,
      effect: photoEffect,
      countdown,
      countdownEndsAt,
      current: activePhoto,
      total: shots,
      message,
      error: cameraError || error,
      frames: guestFrames,
      photos: (pendingStrip?.photos ?? capturePhotos)
        .filter((photo): photo is PhotoRecord => !!photo)
        .map(({ id, thumbnail }) => ({ id, thumbnail })),
      strip: guestStrip,
    },
    async (command) => {
      if (
        guestMode !== 'self-service' ||
        guestPaused ||
        editingTemplate ||
        organizerSetup ||
        loadingTemplate ||
        exportingStrip ||
        (reviewOpen && !kioskMode) ||
        session.current
      )
        throw new Error('Please wait for the organizer.');
      if (command.action === 'frame') {
        if (
          pendingStrip ||
          guestStage !== 'design' ||
          !kioskFrameIds.includes(command.frameId!)
        )
          throw new Error('Choose an available frame.');
        await startKioskTemplate(command.frameId!);
      } else if (command.action === 'design') {
        if (pendingStrip || guestStage !== 'ready')
          throw new Error('Finish the current session first.');
        setKioskStage('design');
      } else if (command.action === 'effect') {
        if (
          !pendingStrip ||
          guestStage !== 'review' ||
          savingStrip.current ||
          !isPhotoEffect(command.effect)
        )
          throw new Error('Choose an effect while reviewing your photos.');
        setPhotoEffect(command.effect);
      } else if (command.action === 'start') {
        if (pendingStrip || guestStage !== 'ready' || !camera.canCapture())
          throw new Error(
            'The camera is not ready. Ask the organizer for help.',
          );
        await startSession();
      } else if (command.action === 'continue') {
        if (
          !pendingStrip ||
          pendingStrip.photos.length >= shots ||
          !camera.canCapture()
        )
          throw new Error('The camera is not ready to finish this session.');
        await startSession('remaining');
      } else if (command.action === 'retake') {
        if (!pendingStrip || !camera.canCapture())
          throw new Error('The camera is not ready for retakes.');
        retakeTargets(pendingStrip, command.photoIds!);
        await startSession(command.photoIds);
      } else if (command.action === 'confirm') {
        if (!pendingStrip || !(await confirmReview()))
          throw new Error(
            'Your strip could not be saved. Ask the organizer to retry.',
          );
      } else if (command.action === 'next') {
        if (pendingStrip || !guestDone)
          throw new Error('Finish the current session first.');
        finishKioskSession();
      }
    },
    video,
  );
  useEffect(() => {
    if (!guest.active) setGuestPaused(false);
  }, [guest.active]);

  async function openFolder() {
    const result = await window.vyora.openLibrary();
    if (!result.ok) setError(result.error);
  }

  async function removeSelectedTemplate() {
    if (!removingTemplate || session.current || pendingStrip) return;
    const id = removingTemplate.id;
    const result = await window.vyora.removeTemplate(id);
    if (!result.ok) throw new Error(result.error);
    setTemplates((current) => current.filter((template) => template.id !== id));
    if (selectedTemplate?.id === id) {
      setSelectedTemplate(null);

      rememberTemplate('');
    }
    setKioskFrameIds((current) => {
      const next = current.filter((frameId) => frameId !== id);
      const frames = next.length ? next : [''];
      try {
        localStorage.setItem('vyora.kiosk-frames', JSON.stringify(frames));
      } catch {
        /* Settings still work for this run. */
      }
      return frames;
    });
    setRemovingTemplate(null);
    setMessage('Template removed from your frame choices.');
  }

  async function editSavedTemplate(id: string) {
    if (session.current || pendingStrip || loadingTemplate) return;
    setLoadingTemplate(true);
    setError('');
    try {
      const result = await window.vyora.getTemplate(id);
      if (!result.ok) throw new Error(result.error);
      setEditingExistingTemplate(result.value);
      setEditingTemplate(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not open this template.',
      );
    } finally {
      setLoadingTemplate(false);
    }
  }

  return (
    <div
      className={`app-shell${kioskMode ? ` kiosk-mode kiosk-stage-${kioskStage}` : ''}`}
    >
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className={`topbar${kioskMode ? ' kiosk-topbar' : ''}`}>
        <div className="brand">
          <span
            className="vyora-logo"
            role="img"
            aria-label="VYORA Photobooth"
          />
        </div>
        {kioskMode ? (
          <div className="kiosk-topbar-center" aria-live="polite">
            <span className="kiosk-live-dot" /> VYORA PHOTO BOOTH
          </div>
        ) : (
          <nav className="main-nav" aria-label="Main navigation">
            <button
              className={tab === 'capture' ? 'nav-item active' : 'nav-item'}
              aria-current={tab === 'capture' ? 'page' : undefined}
              disabled={running || organizerSetup}
              onClick={() => setTab('capture')}
            >
              <Icon name="camera" size={17} /> Photo booth
            </button>
            <button
              className={tab === 'library' ? 'nav-item active' : 'nav-item'}
              aria-current={tab === 'library' ? 'page' : undefined}
              disabled={running || organizerSetup}
              onClick={() => {
                setTab('library');
                void refreshLibrary();
              }}
            >
              <Icon name="grid" size={17} /> My library
              <span className="nav-count">{library?.stripCount ?? '—'}</span>
            </button>
          </nav>
        )}
        <div className="topbar-actions">
          {kioskMode ? (
            <button
              className="kiosk-exit-button"
              type="button"
              disabled={running || !!exportingStrip}
              onClick={() => setConfirmExitBooth(true)}
            >
              <Icon name="exit" size={15} /> Exit booth
            </button>
          ) : (
            <>
              {!organizerSetup && (
                <GuestBoothControls
                  active={guest.active}
                  connected={
                    guest.status?.displayId != null ||
                    !!guest.status?.devices.some(
                      (device) => device.approved && device.connected,
                    )
                  }
                  paused={guestPaused}
                  running={running}
                  done={guestDone}
                  saving={!!exportingStrip}
                  canSetup={
                    !running &&
                    !pendingStrip &&
                    !editingTemplate &&
                    !loadingTemplate &&
                    !exportingStrip
                  }
                  status={
                    guestPaused
                      ? 'Paused · guests cannot start a session.'
                      : running
                        ? `Taking photo ${activePhoto} of ${shots}`
                        : pendingStrip
                          ? 'Reviewing photos · not saved yet'
                          : guestDone
                            ? 'Strip saved · ready for the next group'
                            : 'Ready for your next moment.'
                  }
                  onDisplays={() => guest.setOpen(true)}
                  onSetup={openBoothSetup}
                  onPause={() => {
                    if (running) session.current?.abort();
                    setGuestPaused((value) => !value);
                  }}
                  onNext={finishKioskSession}
                />
              )}
              <ThemePicker theme={theme} onChange={setTheme} />
              <StudioTools
                running={running}
                onPrinter={() => setShowPrinterSettings(true)}
                onPaper={() => setShowPaperManager(true)}
                onFolder={() => void openFolder()}
                onNotice={() => setShowUsageNotice(true)}
              />
            </>
          )}
        </div>
      </header>

      <main id="main">
        {guest.active && guest.issue && (
          <p className="guest-notice" role="alert">
            {guest.issue}
          </p>
        )}
        <div className="page-heading" hidden={kioskMode || organizerSetup}>
          <div>
            <p className="eyebrow">
              <span /> A SPACE FOR YOUR GOOD TIMES
            </p>
            <h1>
              {tab === 'capture' ? (
                <>
                  Life happens. <em>Keep a little.</em>
                </>
              ) : (
                <>
                  Your moments, <em>kept.</em>
                </>
              )}
            </h1>
            <p>
              {tab === 'capture'
                ? 'Come as you are. Strike a pose. Make something worth keeping.'
                : 'A collection of familiar faces and good times.'}
            </p>
          </div>
          <div className="studio-stamp" aria-label="Offline photo studio">
            <span className="vyora-symbol" aria-hidden="true" />
            <span>
              MADE OF MOMENTS.
              <br />
              KEPT BY YOU.
            </span>
          </div>
        </div>
        {error && !kioskMode && (
          <div className="error-banner" role="alert">
            <strong>Something needs your attention</strong>
            <span>{error}</span>
          </div>
        )}
        {cameraError && tab === 'capture' && !kioskMode && (
          <div className="error-banner camera-error" role="alert">
            <div>
              <strong>Camera needs attention</strong>
              <p>{cameraError}</p>
            </div>
            <button
              className="text-button"
              disabled={connecting || running}
              onClick={() => void connectCamera()}
            >
              {connecting ? 'Connecting…' : 'Reconnect'}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        )}

        {organizerSetup && !kioskMode && (
          <section className="booth-setup" aria-labelledby="booth-setup-title">
            <div className="booth-setup-heading">
              <div className="booth-setup-backline">
                <button
                  className="kiosk-back-button"
                  type="button"
                  onClick={() => setOrganizerSetup(false)}
                >
                  Back to Studio
                </button>
                <span className="kiosk-screen-kicker">
                  EVENT BOOTH / ORGANIZER SETUP
                </span>
              </div>
              <h1 id="booth-setup-title">Set up the guest booth.</h1>
              <p>
                Choose the frames guests can use and how long they have to get
                ready before each shot.
              </p>
            </div>
            <div className="booth-setup-section-heading">
              <div>
                <strong>Available photo frames</strong>
                <span>Guests will only see the frames you select here.</span>
              </div>
              <span>{kioskFrameIds.length} selected</span>
            </div>
            <div className="booth-setup-frames">
              <button
                type="button"
                className={`booth-frame-option${kioskFrameIds.includes('') ? ' selected' : ''}`}
                aria-pressed={kioskFrameIds.includes('')}
                onClick={() => toggleKioskFrame('')}
              >
                <span className="booth-frame-check">
                  <Icon name="check" size={14} />
                </span>
                <span className="booth-frame-preview">
                  <FramePreview shots={shots} />
                </span>
                <span className="booth-frame-copy">
                  <strong>Doodle No. 01</strong>
                  <small>{shots} photos · VYORA original</small>
                </span>
              </button>
              {studioFrameChoices.map((choice) => {
                const template = choice.template;
                const checked = kioskFrameIds.includes(choice.id);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    className={`booth-frame-option${checked ? ' selected' : ''}`}
                    aria-pressed={checked}
                    onClick={() => toggleKioskFrame(choice.id)}
                  >
                    <span className="booth-frame-check">
                      <Icon name="check" size={14} />
                    </span>
                    <span className="booth-frame-preview">
                      <FramePreview template={template} shots={shots} />
                    </span>
                    <span className="booth-frame-copy">
                      <strong>{choice.name}</strong>
                      <small>
                        {template.slots.length} photos ·{' '}
                        {template.builtIn ? 'Free VYORA frame' : 'custom frame'}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            <section
              className="booth-session-settings"
              aria-labelledby="booth-session-title"
            >
              <div className="booth-session-heading">
                <h2 id="booth-session-title">Session settings</h2>
                <p>Set the pace and photo count before opening your booth.</p>
              </div>
              <div className="booth-session-options">
                <fieldset
                  className="booth-session-setting"
                  aria-describedby="booth-countdown-description"
                >
                  <legend>Countdown</legend>
                  <p id="booth-countdown-description">
                    Time to get ready before each photo. Applies to every
                    selected frame.
                  </p>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Countdown duration"
                  >
                    {([3, 5, 10] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={value + ' seconds'}
                        aria-pressed={timer === value}
                        className={timer === value ? 'selected' : ''}
                        onClick={() => setTimer(value)}
                      >
                        <strong>{value}</strong>
                        <span>seconds</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </section>
            <footer className="booth-setup-footer">
              <span>
                Camera selection stays in Studio. Guests can’t change it during
                the session.
              </span>
              <button
                className="primary-button kiosk-start-button"
                type="button"
                disabled={!kioskFrameIds.length || loadingTemplate}
                onClick={enterKiosk}
              >
                Start full-screen booth <Icon name="arrow" size={17} />
              </button>
            </footer>
          </section>
        )}

        {kioskMode && kioskStage === 'design' && (
          <section
            className="kiosk-screen kiosk-design-screen"
            aria-labelledby="kiosk-design-title"
          >
            <div className="kiosk-stage-heading">
              <span className="kiosk-screen-kicker">YOUR PHOTO SESSION</span>
              <h1 id="kiosk-design-title">Choose your photo frame.</h1>
              <p>
                Select a frame below. You’ll have time to get ready before we
                take your photos.
              </p>
              {error && (
                <p className="kiosk-inline-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <FrameCarousel>
              {kioskFrameIds.includes('') && (
                <button
                  className="kiosk-template-card"
                  type="button"
                  disabled={loadingTemplate}
                  aria-label={`Choose Doodle No. 01, ${shots} photos`}
                  onClick={() => void startKioskTemplate('')}
                >
                  <span className="kiosk-template-preview">
                    <FramePreview shots={shots} />
                  </span>
                </button>
              )}
              {studioFrameChoices
                .filter((choice) => kioskFrameIds.includes(choice.id))
                .map((choice) => (
                  <button
                    key={choice.id}
                    className="kiosk-template-card"
                    type="button"
                    disabled={loadingTemplate}
                    aria-label={`Choose ${choice.name}, ${choice.template.slots.length} photos`}
                    onClick={() => void startKioskTemplate(choice.id)}
                  >
                    <span className="kiosk-template-preview">
                      <FramePreview template={choice.template} shots={shots} />
                    </span>
                  </button>
                ))}
            </FrameCarousel>
          </section>
        )}

        {kioskMode && kioskStage === 'done' && (
          <section
            className="kiosk-screen kiosk-done-screen"
            aria-labelledby="kiosk-done-title"
          >
            <div className="kiosk-done-preview">
              {kioskStripPreview && (
                <img src={kioskStripPreview} alt="Your saved photo strip" />
              )}
            </div>
            <div className="kiosk-done-copy">
              <span className="kiosk-success-mark">
                <Icon name="check" size={24} />
              </span>
              <span className="kiosk-screen-kicker">A MOMENT TO KEEP</span>
              <h1 id="kiosk-done-title">Your strip is ready.</h1>
              <p>
                It’s saved on this computer. Thanks for stopping by the booth.
              </p>
              <button
                className="primary-button kiosk-start-button"
                type="button"
                onClick={finishKioskSession}
              >
                Next group <Icon name="arrow" size={18} />
              </button>
            </div>
          </section>
        )}

        <div
          className="capture-layout"
          hidden={tab !== 'capture' || organizerSetup}
        >
          <section className="capture-column" aria-label="Camera preview">
            {kioskMode &&
              kioskStage === 'capture' &&
              !running &&
              !pendingStrip && (
                <div className="kiosk-capture-toolbar">
                  <button
                    className="kiosk-back-button"
                    type="button"
                    onClick={() => setKioskStage('design')}
                  >
                    Change frame
                  </button>
                  <span className="kiosk-screen-kicker">
                    {selectedTemplate
                      ? frameChoiceName(selectedTemplate)
                      : 'Doodle No. 01'}{' '}
                    · {shots} photos
                  </span>
                </div>
              )}
            <div
              className={`viewfinder ${ready ? 'is-live' : ''} ${flash ? 'flash' : ''}`}
            >
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                className={mirror ? 'mirrored' : ''}
                hidden={!ready}
              />
              {kioskMode && kioskStage === 'capture' && !ready && (
                <div className="kiosk-camera-notice" role="status">
                  <strong>
                    {connecting
                      ? 'Connecting to the camera…'
                      : 'Camera needs attention'}
                  </strong>
                  <p>
                    {cameraError ||
                      'Please wait while we prepare the live preview.'}
                  </p>
                  {!connecting && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void connectCamera()}
                    >
                      Reconnect camera
                    </button>
                  )}
                </div>
              )}
              {kioskMode && kioskStage === 'capture' && error && (
                <p className="kiosk-capture-error" role="alert">
                  {error}
                </p>
              )}
              {running && (
                <CaptureShotRail
                  total={
                    retaking ? (pendingStrip?.photos.length ?? shots) : shots
                  }
                  current={activePhoto}
                  photos={capturePhotos}
                  remaining={Math.max(0, captureGoal - progress)}
                  retaking={retaking}
                />
              )}
              <div className="preview-label">
                <i className={ready ? 'live' : ''} />
                {ready
                  ? 'LIVE PREVIEW'
                  : connecting
                    ? 'CONNECTING'
                    : cameraState.status === 'paused'
                      ? 'FEED PAUSED'
                      : cameraState.status === 'disconnected'
                        ? 'DISCONNECTED'
                        : 'THE BOOTH IS YOURS'}
              </div>
              <span className="frame-number">
                {running ? 'CAPTURE / ' : ready ? 'PREVIEW / ' : 'STUDIO / '}01
              </span>
              {!ready && (
                <div className="camera-placeholder">
                  <div className="welcome-copy" aria-hidden="true">
                    <span className="welcome-kicker">
                      LESS PERFECT. MORE YOU.
                    </span>
                    <p>
                      Oh, snap.
                      <br />
                      <span>That's</span>
                      <br />a keeper.
                    </p>
                    <span className="welcome-caption">
                      The best moments aren't planned.
                      <br />
                      They're captured.
                    </span>
                  </div>
                  <div className="print-composition" aria-hidden="true">
                    <div className="contact-print">
                      <img src={boothFriends} alt="" />
                      <img src={boothFriends} alt="" />
                      <span>V Y O R A / 0 1</span>
                    </div>
                    <div className="hero-print">
                      <div className="print-heading">
                        <Icon name="spark" size={13} />
                        <span>THE GOOD TIMES CLUB</span>
                        <span>01</span>
                      </div>
                      <img src={boothFriends} alt="" />
                      <div className="print-caption">
                        <span>just us, being us.</span>
                        <Icon name="spark" size={20} />
                      </div>
                    </div>
                    <span className="print-sticker">
                      a little moment,
                      <br />
                      <em>a long time.</em>
                    </span>
                  </div>
                  <div className="camera-connect">
                    <span className="connect-icon">
                      <Icon name="camera" size={20} />
                    </span>
                    <div>
                      <strong>
                        {connecting
                          ? 'Finding your camera…'
                          : cameraError
                            ? 'Let’s get your camera connected'
                            : 'Your next memory starts here'}
                      </strong>
                      <span>
                        {cameraError
                          ? 'Choose a camera or try connecting again.'
                          : 'Enable your camera to step into the frame.'}
                      </span>
                    </div>
                    <button
                      className="primary-button"
                      disabled={connecting}
                      onClick={() => void connectCamera()}
                    >
                      {connecting
                        ? 'Connecting…'
                        : cameraError
                          ? 'Reconnect'
                          : 'Enable camera'}
                      <Icon name="arrow" size={17} />
                    </button>
                  </div>
                </div>
              )}
              {ready && !running && (
                <div className="live-session-label">
                  {kioskMode && !running
                    ? `Your ${timer}-second countdown starts when you’re ready.`
                    : running
                      ? `${retaking ? 'RETAKING PHOTO' : 'PHOTO'} ${activePhoto} OF ${pendingStrip?.photos.length ?? shots}`
                      : `${shots} LITTLE MOMENTS. ONE KEEPER.`}
                </div>
              )}
              {kioskMode &&
                kioskStage === 'capture' &&
                ready &&
                !running &&
                !pendingStrip && (
                  <>
                    <KioskStartSurface
                      disabled={
                        connecting ||
                        !!exportingStrip ||
                        loadingTemplate ||
                        editingTemplate ||
                        guestPaused
                      }
                      countdown={timer}
                      photos={shots}
                      onStart={() => void startSession()}
                    />
                  </>
                )}
              <div className="corner top-left" />
              <div className="corner top-right" />
              <div className="corner bottom-left" />
              <div className="corner bottom-right" />
              <CaptureCountdown value={countdown} endsAt={countdownEndsAt} />
              {kioskMode &&
                running &&
                countdown == null &&
                camera.source === 'tethered' && (
                  <p className="kiosk-shot-progress" role="status">
                    {message}
                  </p>
                )}
            </div>
            <div className="preview-footer">
              <span role="status">
                <span className="status-dot" />
                {connecting
                  ? 'Connecting…'
                  : ready
                    ? cameraLabel
                    : cameraState.status === 'paused'
                      ? 'Camera feed paused'
                      : cameraState.status === 'disconnected'
                        ? 'Camera disconnected'
                        : cameraError
                          ? 'Camera unavailable'
                          : 'Camera is off'}
                <span className="preview-separator">/</span>
                {mirror
                  ? 'Photos match the mirrored preview'
                  : 'Photos match the camera view'}
              </span>
              <div className="preview-tools">
                {(ready || cameraState.status === 'paused' || connecting) && (
                  <button
                    className="camera-off-button"
                    disabled={running}
                    onClick={disconnectCamera}
                  >
                    <Icon name="power" size={13} />
                    Turn off
                  </button>
                )}
                <label className="mirror-control">
                  <input
                    type="checkbox"
                    checked={mirror}
                    disabled={running || !!pendingStrip}
                    onChange={(event) => setMirror(event.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  Mirror photos
                </label>
              </div>
            </div>
            <div
              className="capture-actions"
              hidden={kioskMode && (kioskStage !== 'capture' || running)}
            >
              <div className="session-status">
                <span className="session-status-icon">
                  <Icon name={running ? 'clock' : 'check'} size={18} />
                </span>
                <div>
                  <p aria-live="polite">{message}</p>
                  <span>
                    {running
                      ? `${progress} / ${captureGoal} photos ${retaking ? 'retaken' : 'captured'}`
                      : 'Your photos come together in a VYORA strip.'}
                  </span>
                </div>
              </div>
              {!running && (
                <>
                  {(!kioskMode || !!pendingStrip) && (
                    <button
                      className="primary-button capture-button"
                      disabled={
                        !ready ||
                        connecting ||
                        !!exportingStrip ||
                        loadingTemplate ||
                        editingTemplate
                      }
                      onClick={() =>
                        pendingStrip ? setReviewOpen(true) : void startSession()
                      }
                    >
                      <span className="shutter-icon" aria-hidden="true" />
                      {pendingStrip
                        ? 'Review photos'
                        : ready
                          ? `Take ${shots} photos`
                          : 'Enable camera first'}
                      <Icon name="arrow" size={17} />
                    </button>
                  )}
                </>
              )}
            </div>
            {pendingStrip && (
              <div className="pending-strip-notice" role="status">
                <div>
                  <strong>Your photos are ready for review</strong>
                  <span>Retake any photo, then confirm your strip.</span>
                </div>
                <button
                  className="outline-button"
                  disabled={!!exportingStrip || running}
                  onClick={() => setReviewOpen(true)}
                >
                  {exportingStrip === pendingStrip.id
                    ? 'Saving…'
                    : 'Review photos'}
                  <Icon name="arrow" size={15} />
                </button>
              </div>
            )}
          </section>
          <aside
            className="settings-panel"
            hidden={kioskMode}
            aria-labelledby="settings-title"
          >
            <div className="panel-heading">
              <span className="eyebrow">THE LITTLE DETAILS</span>
              <span className="panel-number">02</span>
            </div>
            <h2 id="settings-title">
              Make it yours<span>.</span>
            </h2>
            <p className="panel-description">Set up your next little moment.</p>
            <div
              className="settings-view-switch"
              role="group"
              aria-label="Session settings"
            >
              <button
                type="button"
                aria-pressed={settingsView === 'capture'}
                aria-controls="capture-settings"
                onClick={() => setSettingsView('capture')}
              >
                <Icon name="camera" size={15} /> Capture
              </button>
              <button
                type="button"
                aria-pressed={settingsView === 'frame'}
                aria-controls="frame-settings"
                onClick={() => setSettingsView('frame')}
              >
                <Icon name="grid" size={15} /> Frame
              </button>
            </div>
            <div
              id="capture-settings"
              className="settings-content"
              hidden={settingsView !== 'capture'}
            >
              <div className="field-label" id="camera-label">
                <span>01</span> Camera source
                <button
                  className="refresh-cameras"
                  aria-label="Refresh cameras"
                  disabled={running || connecting || scanning}
                  onClick={() => void refreshCameras()}
                >
                  <Icon name="refresh" size={13} />
                  {scanning ? 'Finding…' : 'Refresh'}
                </button>
              </div>
              <details
                className="camera-picker"
                ref={cameraPicker}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && cameraPicker.current) {
                    cameraPicker.current.open = false;
                    cameraPicker.current.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary
                  aria-labelledby="camera-label camera-name"
                  aria-disabled={running || connecting}
                  onClick={(event) => {
                    if (running || connecting) event.preventDefault();
                  }}
                >
                  <span className="device-icon">
                    <Icon name="camera" size={19} />
                  </span>
                  <span className="device-copy">
                    <strong id="camera-name">
                      {connecting
                        ? 'Connecting to camera…'
                        : ready
                          ? cameraLabel
                          : selectedCamera?.label ||
                            cameraLabel ||
                            'Choose your camera'}
                    </strong>
                    <span>
                      {ready
                        ? `Connected${cameraResolution ? ` · ${cameraResolution}` : ''}`
                        : cameraState.status === 'paused'
                          ? 'Feed paused · check connection'
                          : cameraState.status === 'disconnected'
                            ? 'Disconnected · reconnect to continue'
                            : devices.length
                              ? `${devices.length} camera${devices.length === 1 ? '' : 's'} available`
                              : equipment.source === 'tethered'
                                ? 'Connect through digiCamControl'
                                : 'Connect a webcam to get started'}
                    </span>
                  </span>
                  <Icon name="chevron" size={15} />
                </summary>
                <div
                  className="camera-options"
                  role="group"
                  aria-label="Available cameras"
                >
                  {devices.length ? (
                    devices.map((device, index) => (
                      <button
                        key={device.deviceId || index}
                        disabled={running || connecting}
                        aria-pressed={ready && deviceId === device.deviceId}
                        onClick={() => {
                          if (cameraPicker.current)
                            cameraPicker.current.open = false;
                          void connectCamera(device.deviceId);
                        }}
                      >
                        <Icon name="camera" size={17} />
                        <span>{device.label || `Camera ${index + 1}`}</span>
                        {ready && deviceId === device.deviceId && (
                          <Icon name="check" size={15} />
                        )}
                      </button>
                    ))
                  ) : (
                    <p>
                      {equipment.source === 'tethered'
                        ? 'Open digiCamControl, then select Enable camera.'
                        : 'No webcams found. Connect one, then select Refresh.'}
                    </p>
                  )}
                </div>
              </details>
              <button
                type="button"
                className="camera-help-button"
                aria-haspopup="dialog"
                disabled={running}
                onClick={() => setShowCameraHelp(true)}
              >
                Camera help
                <Icon name="help" size={14} />
              </button>
              <CameraCaptureSettings
                value={equipment}
                disabled={
                  running || connecting || !!pendingStrip || !!exportingStrip
                }
                onChange={configureEquipment}
              />
              <fieldset disabled={running}>
                <legend>
                  <span>02</span> Countdown
                </legend>
                <div className="segmented">
                  {([3, 5, 10] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={timer === value}
                      className={timer === value ? 'selected' : ''}
                      onClick={() => setTimer(value)}
                    >
                      {value}
                      <span> sec</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                className="current-frame-button"
                type="button"
                onClick={() => setSettingsView('frame')}
              >
                <Icon name="grid" size={16} />
                <span>
                  <small>Selected frame</small>
                  <strong>
                    {selectedTemplate
                      ? frameChoiceName(selectedTemplate)
                      : 'Doodle No. 01'}
                  </strong>
                </span>
                <Icon name="arrow" size={15} />
              </button>
            </div>
            <div
              id="frame-settings"
              className="settings-content"
              hidden={settingsView !== 'frame'}
            >
              <div className="custom-template-controls">
                <div className="template-select-field">
                  <span>Strip template</span>
                  <StudioSelect
                    label="Strip template"
                    value={
                      selectedTemplate ? frameChoiceId(selectedTemplate) : ''
                    }
                    disabled={
                      running ||
                      !!pendingStrip ||
                      loadingTemplate ||
                      !!exportingStrip
                    }
                    onChange={(value) => {
                      if (
                        olderCustomFrames.some(
                          (template) => template.id === value,
                        )
                      )
                        void editSavedTemplate(value);
                      else void chooseTemplate(value);
                    }}
                    getActions={(id) => {
                      const target = templates.find(
                        (template) => template.id === id,
                      );
                      return target && !target.builtIn
                        ? [
                            {
                              label: 'Edit',
                              icon: 'edit',
                              onClick: () => void editSavedTemplate(id),
                            },
                            {
                              label: 'Remove',
                              icon: 'remove',
                              onClick: () => setRemovingTemplate(target),
                            },
                          ]
                        : [];
                    }}
                    options={[
                      {
                        value: '',
                        label: 'Doodle No. 01',
                        description: 'Included VYORA frame',
                      },
                      ...studioFrameChoices.map((choice) => ({
                        value: choice.id,
                        label: choice.name,
                        description: choice.template.builtIn
                          ? 'Free VYORA frame · 4 photos'
                          : `${choice.template.slots.length} photo areas · custom frame`,
                      })),
                      ...olderCustomFrames.map((template) => ({
                        value: template.id,
                        label: template.name,
                        description: 'Edit to add 4 photo areas',
                      })),
                    ]}
                  />
                </div>
                <div className="frame-preview-card">
                  <FramePreview
                    template={selectedTemplate ?? undefined}
                    shots={shots}
                  />
                  <div>
                    <strong>{shots} photo openings</strong>
                    <p>Your photos fill the frame automatically.</p>
                  </div>
                </div>
                <button
                  disabled={
                    running ||
                    !!pendingStrip ||
                    loadingTemplate ||
                    !!exportingStrip
                  }
                  onClick={() => {
                    setError('');
                    setEditingExistingTemplate(undefined);
                    setEditingTemplate(true);
                  }}
                >
                  Create a template
                </button>
                <p>PNG or JPEG · 4 photo areas.</p>
              </div>
            </div>
            <div className="session-summary">
              <div className="frame-sequence" aria-hidden="true">
                {Array.from({ length: sequenceLength }, (_, index) => {
                  const replacing =
                    running && retaking && index === activePhoto - 1;
                  const captured = completedSlots.includes(index);
                  return (
                    <span
                      key={index}
                      className={
                        replacing ? 'retaking' : captured ? 'taken' : ''
                      }
                      title={`Photo ${index + 1}: ${replacing ? 'retaking' : captured ? 'captured' : 'waiting'}`}
                    >
                      {replacing ? (
                        <Icon name="clock" size={12} />
                      ) : captured ? (
                        <Icon name="check" size={12} />
                      ) : (
                        String(index + 1).padStart(2, '0')
                      )}
                    </span>
                  );
                })}
              </div>
              <span>
                {sequenceLength} photos <b>·</b> {timer}s countdown
              </span>
            </div>
          </aside>
        </div>
        <section
          className="recent-section"
          aria-labelledby="recent-title"
          hidden={tab !== 'library' || kioskMode || organizerSetup}
        >
          <div className="section-heading">
            <h2 id="recent-title">
              Your photo strips
              <span className="photo-count">
                {library?.stripCount ?? '—'}{' '}
                {library?.stripCount === 1 ? 'strip' : 'strips'}
              </span>
            </h2>
            <span className="library-limit">
              Latest 12 strips · only the finished strip is saved
            </span>
          </div>
          {visibleStrips.length ? (
            <div className="strip-grid">
              {visibleStrips.map((strip) => (
                <StripCard
                  key={strip.id}
                  strip={strip}
                  pending={strip.id === pendingStrip?.id}
                  onDelete={
                    strip.preview ? () => setDeletingStrip(strip) : undefined
                  }
                  onView={() => {
                    if (strip.id === pendingStrip?.id) {
                      setTab('capture');
                      setReviewOpen(true);
                    } else setViewingStrip(strip);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="empty-library">
              <div className="empty-prints" aria-hidden="true">
                <span />
                <span>
                  <Icon name="spark" size={19} />
                </span>
              </div>
              <div>
                <strong>
                  {library
                    ? 'A blank page for your next good memory.'
                    : 'Opening your photo library…'}
                </strong>
                <p>
                  {library
                    ? 'Your first VYORA strip will appear here after a session.'
                    : 'Your moments are stored on this computer.'}
                </p>
              </div>
              <span className="empty-note">
                GOOD THINGS TAKE A CLICK.
                <Icon name="arrow" size={19} />
              </span>
            </div>
          )}
        </section>
        <footer className="app-footer">
          <span>
            <span
              className="vyora-wordmark"
              role="img"
              aria-label="VYORA Photobooth"
            />
            <span>A little moment. A lasting feeling.</span>
          </span>
          <span
            className="footer-version"
            aria-label={`VYORA version ${appVersion}`}
          >
            VYORA v{appVersion}
          </span>
        </footer>
      </main>

      {guest.open && (
        <GuestDisplayPanel
          status={guest.status}
          issue={guest.issue}
          configure={guest.configure}
          onClose={() => guest.setOpen(false)}
        />
      )}
      {showCameraHelp && (
        <CameraHelp onClose={() => setShowCameraHelp(false)} />
      )}
      {showUsageNotice && (
        <UsageNoticeDialog onClose={() => setShowUsageNotice(false)} />
      )}
      {confirmExitBooth && (
        <ExitBoothDialog
          onClose={() => setConfirmExitBooth(false)}
          onConfirm={() => {
            setConfirmExitBooth(false);
            exitKiosk();
          }}
        />
      )}
      {editingTemplate && (
        <TemplateEditor
          initialTemplate={editingExistingTemplate}
          onClose={() => {
            setEditingTemplate(false);
            setEditingExistingTemplate(undefined);
          }}
          onSaved={(template) => void templateSaved(template)}
        />
      )}
      {removingTemplate && (
        <TemplateRemoveDialog
          name={removingTemplate.name}
          onClose={() => setRemovingTemplate(null)}
          onConfirm={removeSelectedTemplate}
        />
      )}
      {reviewOpen && pendingStrip && !running && (
        <CaptureReview
          key={pendingStrip.id}
          strip={pendingStrip}
          total={shots}
          effect={photoEffect}
          exporting={!!exportingStrip}
          onEffectChange={(effect) => {
            if (!savingStrip.current) setPhotoEffect(effect);
          }}
          onContinue={() => void startSession('remaining')}
          timer={timer}
          cameraReady={ready}
          connecting={connecting}
          cameraError={cameraError}
          captureError={error}
          onClose={() => setReviewOpen(false)}
          onRetake={(ids) => void startSession(ids)}
          onConnect={() => connectCamera()}
          onConfirm={confirmReview}
        />
      )}
      {activeStrip && !reviewOpen && (
        <StripViewer
          key={activeStrip.id}
          strip={activeStrip}
          pending={activeStrip.id === pendingStrip?.id}
          onClose={() => setViewingStrip(null)}
          onSave={() => saveStrip(activeStrip.id)}
          onRefresh={refreshLibrary}
          printerRevision={printerRevision}
          onPrinterSettings={() => setShowPrinterSettings(true)}
          onPaperLayout={() => setShowPaperManager(true)}
        />
      )}
      {deletingStrip && (
        <DeleteStripDialog
          strip={deletingStrip}
          onClose={() => setDeletingStrip(null)}
          onDeleted={(id) => {
            setDeletingStrip(null);
            setViewingStrip((current) => (current?.id === id ? null : current));
            setLibrary(
              (current) =>
                current && {
                  ...current,
                  stripCount: Math.max(0, current.stripCount - 1),
                  strips: current.strips.filter((strip) => strip.id !== id),
                },
            );
            void refreshLibrary();
          }}
        />
      )}
      {showPaperManager && (
        <PaperManager
          strips={library?.strips ?? []}
          printerRevision={printerRevision}
          onClose={() => setShowPaperManager(false)}
          onSettings={() => setShowPrinterSettings(true)}
        />
      )}
      {showPrinterSettings && (
        <PrinterSettings
          onClose={() => setShowPrinterSettings(false)}
          onSaved={(settings) => {
            setPrinterRevision((value) => value + 1);
            if (settings.layout === 'sheet') setShowPaperManager(true);
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <NoticeGate appVersion={appVersion}>
    <App />
  </NoticeGate>,
);
