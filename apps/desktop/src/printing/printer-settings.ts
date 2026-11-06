import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PrinterSettings } from '@vyora/shared';
import { validatePrinterSettings } from './print-layout.ts';

export function printerSettingsStore(directory: string) {
  const filename = path.join(directory, 'printer-settings.json');
  return {
    async read(): Promise<{ settings: PrinterSettings | null; issue: string }> {
      try {
        if ((await stat(filename)).size > 65536)
          throw new Error('Oversized settings');
        const json = await readFile(filename, 'utf8');
        if (json.length > 65536) throw new Error('Oversized settings');
        const value = JSON.parse(json);
        if (value.version !== 1) throw new Error('Unknown settings version');
        return { settings: validatePrinterSettings(value.settings), issue: '' };
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
          return { settings: null, issue: '' };
        return {
          settings: null,
          issue:
            'Saved printer settings could not be read. Choose and save your printer again.',
        };
      }
    },
    async write(settings: PrinterSettings) {
      const valid = validatePrinterSettings(settings);
      const temporary = path.join(
        directory,
        `printer-settings-${randomUUID()}.tmp`,
      );
      try {
        await writeFile(
          temporary,
          JSON.stringify({ version: 1, settings: valid }),
          {
            flag: 'wx',
            mode: 0o600,
            flush: true,
          },
        );
        await rename(temporary, filename);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}
