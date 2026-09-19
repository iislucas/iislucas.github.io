/* image-storage.ts
 *
 * Uploads images to Cloud Storage, under `images/` — the only prefix that
 * storage.rules lets an admin write to (and everyone read).
 *
 * Used by the markdown editor's image button and by <app-editable-image>, so
 * that every image on the site lands in the same place with the same naming.
 */

import { FirebaseApp } from 'firebase/app';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';

// The top-level folder storage.rules opens up. Uploads anywhere else are refused.
export const IMAGES_ROOT = 'images';

/**
 * Makes a file name safe to use in a storage path: anything but letters,
 * digits, dot, dash and underscore becomes '_'. Returns 'image' for a name
 * that has nothing usable left.
 */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.replace(/_/g, '') === '' ? 'image' : cleaned;
}

/**
 * The storage path for an upload: `images/<folder>/<timestamp>_<name>`. The
 * timestamp keeps a re-upload from overwriting the image an existing page (or
 * an undo) still points at.
 */
export function imageStoragePath(folder: string, name: string, now = Date.now()): string {
  const cleanFolder = folder
    .split('/')
    // Dot segments are dropped, so a folder can never name a path outside images/.
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .map(safeFileName)
    .join('/');
  const prefix = cleanFolder ? `${IMAGES_ROOT}/${cleanFolder}` : IMAGES_ROOT;
  return `${prefix}/${now}_${safeFileName(name)}`;
}

/** Uploads one image and returns its public download URL. */
export async function uploadImage(
  app: FirebaseApp,
  blob: Blob,
  folder: string,
  name: string,
): Promise<string> {
  const fileRef = storageRef(getStorage(app), imageStoragePath(folder, name));
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/png' });
  return getDownloadURL(fileRef);
}
