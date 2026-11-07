import type { BrowserWindow } from 'electron';
import type { PrinterSettings } from '@vyora/shared';
import {
  PrintError,
  PrintUncertainError,
  printGeometry,
} from './print-layout.ts';

export interface PrintTarget {
  pageSize: { width: number; height: number };
  images: number;
}

export function submitPrintWindow(
  createWindow: () => BrowserWindow,
  html: string,
  settings: PrinterSettings,
  signal: AbortSignal,
  onSubmitting: () => void,
  target?: PrintTarget,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const window = createWindow();
    const contents = window.webContents;
    let settled = false;
    let submitting = false;
    const finish = (cause?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', aborted);
      window.removeListener('closed', closed);
      contents.removeListener('render-process-gone', closed);
      if (!window.isDestroyed()) window.destroy();
      if (cause) reject(cause);
      else resolve();
    };
    const aborted = () => finish(signal.reason);
    const closed = () =>
      finish(
        submitting
          ? new PrintUncertainError('Printer response interrupted.')
          : new PrintError(
              'The print preview could not be prepared. Try again.',
            ),
      );
    signal.addEventListener('abort', aborted, { once: true });
    window.once('closed', closed);
    contents.once('render-process-gone', closed);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    void (async () => {
      try {
        await window.loadURL('about:blank');
        if (settled) return;
        // Deliver the document without a giant data URL or temporary photo files.
        // Only validated base64 JPEG data and fixed markup enter this document.
        const images = await contents.executeJavaScript(`(async () => {
          document.open(); document.write(${JSON.stringify(html)}); document.close();
          for (const image of document.querySelectorAll('img[data-copy-of]')) {
            const original = document.getElementById(image.dataset.copyOf);
            if (!original) throw new Error('Missing strip copy');
            image.src = original.src;
          }
          await Promise.all(Array.from(document.images, image => image.decode()));
          await document.fonts.ready;
          return Array.from(document.images).filter(image => image.naturalWidth > 0 && image.naturalHeight > 0).length;
        })()`);
        if (settled) return;
        signal.throwIfAborted();
        const geometry = target || {
          ...printGeometry(settings.layout),
          images: printGeometry(settings.layout).columns,
        };
        if (images !== geometry.images)
          throw new PrintError(
            'The strip image did not load. Nothing was sent to the printer.',
          );
        onSubmitting();
        submitting = true;
        contents.print(
          {
            silent: true,
            deviceName: settings.deviceName,
            copies: settings.copies,
            color: true,
            printBackground: true,
            landscape: false,
            scaleFactor: 100,
            margins: { marginType: 'none' },
            pageSize: geometry.pageSize,
            pagesPerSheet: 1,
            pageRanges: [{ from: 0, to: 0 }],
            duplexMode: 'simplex',
            header: '',
            footer: '',
          },
          (success, reason) => {
            if (success) finish();
            else
              finish(
                new PrintError(
                  reason === 'Invalid printer settings'
                    ? 'The printer rejected these paper settings. Check its driver and the selected paper size.'
                    : reason === 'Print job canceled'
                      ? 'The print job was canceled.'
                      : 'Windows could not submit this print job. Check the printer and its print queue before trying again.',
                ),
              );
          },
        );
      } catch (cause) {
        finish(
          submitting
            ? new PrintUncertainError('Printer response interrupted.')
            : cause,
        );
      }
    })();
  });
}
