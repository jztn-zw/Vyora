import { randomUUID } from 'node:crypto';
import type {
  PhotoCrop,
  PhotoRecord,
  StripRecord,
  StripTemplate,
} from '@vyora/shared';
import { capturePhotoCount } from '../photo-sources.ts';
import {
  DEFAULT_PHOTO_CROP,
  photoAreaViews,
  validatePhotoCrop,
} from '../photo-framing.ts';

const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Individual captures exist only in RAM. They never enter the photo library.
export function createSessionBuffer() {
  let sessionId = '';
  let photos: { record: PhotoRecord; jpeg: Buffer }[] = [];
  let template: StripTemplate | undefined;
  let createdAt = '';
  let photoCrops: PhotoCrop[] | undefined;
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
        photos.length >= capturePhotoCount(template ?? selectedTemplate) ||
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
      if (photoCrops)
        photoCrops = photoAreaViews({ template, photoCrops }).map((area) => ({
          ...(area.photoIndex === index
            ? DEFAULT_PHOTO_CROP
            : (area.crop ?? DEFAULT_PHOTO_CROP)),
        }));
      return record;
    },
    setCrop(id: string, areaIndex: number, input: unknown) {
      const areas = photoAreaViews({ template, photoCrops });
      if (
        !validId.test(id) ||
        id !== sessionId ||
        !Number.isInteger(areaIndex) ||
        areaIndex < 0 ||
        areaIndex >= areas.length ||
        !photos[areas[areaIndex].photoIndex]
      )
        throw new Error(
          'Choose a captured photo area from the current session.',
        );
      const crop = validatePhotoCrop(input);
      photoCrops = areas.map((area, index) => ({
        ...(index === areaIndex ? crop : (area.crop ?? DEFAULT_PHOTO_CROP)),
      }));
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
            ...(photoCrops
              ? { photoCrops: photoCrops.map((crop) => ({ ...crop })) }
              : {}),
          }
        : undefined;
    },
    read(id: string): StripRecord {
      if (!validId.test(id) || id !== sessionId || !photos.length)
        throw new Error('Capture session not found.');
      return {
        id,
        template,
        ...(photoCrops
          ? { photoCrops: photoCrops.map((crop) => ({ ...crop })) }
          : {}),
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
      photoCrops = undefined;
      createdAt = '';
    },
  };
}
