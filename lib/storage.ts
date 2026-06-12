/**
 * Object storage adapter.
 * Production: private S3-compatible bucket (Hetzner Object Storage) served via
 * short-lived signed URLs only. Local/alpha: filesystem under STORAGE_DIR.
 * The interface is what the pipeline depends on — swapping the backend never
 * touches worker logic.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

export interface StoredObject {
  base64Data: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  get(storageKey: string): Promise<StoredObject>;
  put(storageKey: string, data: Buffer): Promise<void>;
}

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./storage";

export function resolveStoragePath(storageRoot: string, storageKey: string): string {
  if (!storageKey || isAbsolute(storageKey) || win32.isAbsolute(storageKey)) {
    throw new Error(
      storageKey ? "storageKey must be relative" : "storageKey must not be empty",
    );
  }

  const root = resolve(storageRoot);
  const path = resolve(root, storageKey);
  const relativePath = relative(root, path);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`storageKey escapes storage root: ${storageKey}`);
  }
  return path;
}

function resolveSafe(storageKey: string): string {
  return resolveStoragePath(STORAGE_DIR, storageKey);
}

export const localFsStorage: StorageAdapter = {
  async get(storageKey) {
    const buf = await readFile(resolveSafe(storageKey));
    return { base64Data: buf.toString("base64"), sizeBytes: buf.byteLength };
  },
  async put(storageKey, data) {
    const path = resolveSafe(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
};
