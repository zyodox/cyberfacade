/**
 * IndexedDB blob store for imported assets (images, videos, fonts). Assets are
 * content-addressed, so user presets / "My layers" can reference them by id and
 * they survive restarts without bloating localStorage. Metadata and blobs live
 * in separate stores so listing the library never loads video data. Every call
 * is guarded — storage may be unavailable, in which case assets are session-only.
 */
import type { AssetMeta } from "./assets";

const DB_NAME = "facade-studio-assets";
const META = "meta";
const BLOBS = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META);
      req.result.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbPut(meta: AssetMeta, blob: Blob): Promise<void> {
  try {
    await request(BLOBS, "readwrite", (s) => s.put(blob, meta.id));
    await request(META, "readwrite", (s) => s.put(meta, meta.id));
  } catch (e) {
    console.warn("Asset could not be stored persistently", e);
  }
}

export async function idbGetBlob(id: string): Promise<Blob | null> {
  try {
    return (await request<Blob | undefined>(BLOBS, "readonly", (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function idbDelete(id: string): Promise<void> {
  try {
    await request(META, "readwrite", (s) => s.delete(id));
    await request(BLOBS, "readwrite", (s) => s.delete(id));
  } catch {
    /* non-fatal */
  }
}

export async function idbListMeta(): Promise<AssetMeta[]> {
  try {
    return await request<AssetMeta[]>(META, "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}
