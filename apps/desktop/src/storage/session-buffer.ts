import { randomUUID } from 'node:crypto';
import type { PhotoRecord, StripRecord, StripTemplate } from '@vyora/shared';

const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Individual captures exist only in RAM. They never enter the photo library.
export function createSessionBuffer() {
  let sessionId = '';
  let photos: { record: PhotoRecord; jpeg: Buffer }[] = [];
  let template: StripTemplate | undefined;
  let createdAt = '';
  return {
    stage(
      id: string,
      jpeg: Buffer,
      size: { width: number; height: number },
      thumbnail: string,
      selectedTemplate?: StripTemplate,
    ): PhotoRecord {
      if (
        !validId.test(id) ||
        (sessionId && sessionId !== id) ||
        photos.length >= (template?.slots.length ?? 4) ||
        (sessionId && template?.id !== selectedTemplate?.id)
      ) {
        throw new Error(
          'Finish saving the current strip before starting another session.',
        );
      }
      sessionId = id;
      if (!photos.length) template = selectedTemplate;
      const record = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...size,
        thumbnail,
      };
      photos.push({ record, jpeg });
      if (photos.length === 1) createdAt = record.createdAt;
      return record;
    },
    replace(
      id: string,
      photoId: string,
      jpeg: Buffer,
      size: { width: number; height: number },
      thumbnail: string,
    ): PhotoRecord {
      const index = photos.findIndex(({ record }) => record.id === photoId);
      if (!validId.test(id) || id !== sessionId || index < 0)
        throw new Error('This photo is not in the current unsaved session.');
      const record = {
        id: photoId,
        createdAt: new Date().toISOString(),
        ...size,
        thumbnail,
      };
      photos[index] = { record, jpeg };
      return record;
    },
    has(id: string) {
      return sessionId === id && photos.length > 0;
    },
    pending(): StripRecord | undefined {
      return photos.length
        ? {
            id: sessionId,
            createdAt,
            photos: photos.map(({ record }) => ({ ...record })),
            template,
          }
        : undefined;
    },
    read(id: string): StripRecord {
      if (!validId.test(id) || id !== sessionId || !photos.length)
        throw new Error('Capture session not found.');
      return {
        id,
        template,
        createdAt,
        photos: photos.map(({ record, jpeg }) => ({
          ...record,
          thumbnail: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
        })),
      };
    },
    clear(id: string) {
      if (id !== sessionId) return;
      photos = [];
      sessionId = '';
      template = undefined;
      createdAt = '';
    },
  };
}
