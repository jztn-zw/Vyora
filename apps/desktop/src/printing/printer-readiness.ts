import type { PrinterDevice } from '@vyora/shared';
import { PrintError } from './print-layout.ts';

// Electron exposes Windows PRINTER_INFO_2 status flags. Never treat a missing
// status as online. Drivers can report stale status; this is not a paper sensor.
export function describePrinter(
  device: {
    name: string;
    displayName?: string;
    status?: number;
    options?: object;
  },
  platform: string,
): PrinterDevice {
  const options = device.options as Record<string, unknown> | undefined;
  const virtual = /pdf|xps|onenote|fax|print to file/i.test(
    `${device.name} ${device.displayName ?? ''} ${options?.['printer-make-and-model'] ?? ''}`,
  );
  const known =
    platform === 'win32' &&
    Number.isInteger(device.status) &&
    device.status! >= 0 &&
    device.status! <= 0xffffffff;
  const allowed =
    0x100 | 0x200 | 0x400 | 0x2000 | 0x4000 | 0x8000 | 0x10000 | 0x1000000;
  const blocked = known && (device.status! & ~allowed) !== 0;
  const message = virtual
    ? 'Choose a physical photo printer for auto-print.'
    : !known
      ? 'Windows could not confirm this printer’s status.'
      : device.status! & 0x80
        ? 'The printer is offline. Connect and power it on.'
        : device.status! & 0x1
          ? 'The printer is paused. Resume it in Windows.'
          : device.status! & 0x10
            ? 'The printer is out of paper.'
            : device.status! & 0x8
              ? 'The printer has a paper jam.'
              : blocked
                ? 'The printer needs attention. Check its queue, paper and driver.'
                : 'Windows reports this printer ready.';
  return {
    name: device.name,
    displayName: device.displayName || device.name,
    virtual,
    readiness: virtual || blocked ? 'unavailable' : known ? 'ready' : 'unknown',
    statusMessage: message,
  };
}

export function requireAutoPrinter(devices: PrinterDevice[], name: string) {
  const device = devices.find((printer) => printer.name === name);
  if (!device)
    throw new PrintError(
      'Your selected printer is not detected. Connect it and refresh Printer settings.',
    );
  if (device.virtual || device.readiness !== 'ready')
    throw new PrintError(
      device.statusMessage ||
        'Windows has not confirmed that this printer is ready. Check its connection and refresh.',
    );
  return device;
}
