/**
 * Imported assets: photos, videos and fonts. Documents reference them by a
 * content-derived id (image/video layer params hold the id; font params hold
 * "asset:<id>"), so presets, "My layers" and projects stay small JSON while the
 * bytes live in IndexedDB (and in a sidecar folder / embedded base64 when a
 * project or preset file is written).
 *
 * Decoding is lazy and asynchronous: getters return null until ready and
 * notify `onAssetsChanged` listeners (the renderer re-renders) once they are.
 */
import { create } from "zustand";
import { getGenerator } from "../procedural/registry";
import type { FacadeDocument, LayerInstance } from "../procedural/types";
import { idbDelete, idbGetBlob, idbListMeta, idbPut } from "./idb";
import { isSvg, svgBitmap } from "./logoRaster";

export type AssetKind = "image" | "video" | "font";

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  /** Video length in seconds. */
  duration?: number;
  /** CSS family registered for fonts. */
  family?: string;
  addedAt: number;
}

export interface PackedAsset {
  meta: AssetMeta;
  /** Base64 file contents. */
  data: string;
}

interface AssetState {
  assets: Record<string, AssetMeta>;
  /** Bumped whenever an asset finishes loading/decoding. */
  version: number;
}

export const useAssets = create<AssetState>()(() => ({ assets: {}, version: 0 }));

const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();
const bitmaps = new Map<string, ImageBitmap>();
const pending = new Map<string, Promise<unknown>>();
const fonts = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function onAssetsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function changed(): void {
  useAssets.setState((s) => ({ version: s.version + 1 }));
  listeners.forEach((f) => f());
}

const EXT_KIND: Record<string, AssetKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  avif: "image",
  svg: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  ogv: "video",
  ttf: "font",
  otf: "font",
  woff: "font",
  woff2: "font",
};

export function kindOfFile(name: string, mime = ""): AssetKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("font/") || /font/.test(mime)) return "font";
  return EXT_KIND[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export const ACCEPT: Record<AssetKind, string> = {
  image: "image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.svg",
  video: "video/*,.mp4,.webm,.mov,.m4v",
  font: ".ttf,.otf,.woff,.woff2",
};

/** Content id: SHA-256 of size + head + tail (fast even for large videos). */
async function contentId(kind: AssetKind, blob: Blob): Promise<string> {
  const CH = 2 * 1024 * 1024;
  const parts: BlobPart[] = [String(blob.size), blob.slice(0, CH)];
  if (blob.size > CH) parts.push(blob.slice(Math.max(CH, blob.size - CH)));
  const buf = await new Blob(parts).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return kind[0] + Array.from(hash.slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}

function probeVideo(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 });
    v.onerror = () => reject(new Error("This video format can't be decoded (try H.264 MP4 or VP9 WebM)."));
    v.src = url;
  });
}

function registerFont(meta: AssetMeta, blob: Blob): Promise<void> {
  let p = fonts.get(meta.id);
  if (!p) {
    p = blob
      .arrayBuffer()
      .then((buf) => new FontFace(meta.family!, buf).load())
      .then((face) => {
        document.fonts.add(face);
        changed();
      });
    fonts.set(meta.id, p);
  }
  return p;
}

function attach(meta: AssetMeta, blob: Blob): void {
  blobs.set(meta.id, blob);
  useAssets.setState((s) => ({ assets: { ...s.assets, [meta.id]: meta } }));
  if (meta.kind === "font") void registerFont(meta, blob).catch((e) => console.warn("Font failed to load", e));
}

/** Imports a file (or blob) into the library; returns the existing entry for identical content. */
export async function importAsset(blob: Blob, name: string, mime0 = blob.type): Promise<AssetMeta> {
  const mime = !mime0 && /\.svg$/i.test(name) ? "image/svg+xml" : mime0;
  const kind = kindOfFile(name, mime);
  if (!kind) throw new Error(`“${name}” is not a supported image, video or font file.`);
  const id = await contentId(kind, blob);
  const existing = useAssets.getState().assets[id];
  if (existing && blobs.has(id)) return existing;

  const base = name.replace(/\.[^.]+$/, "");
  const meta: AssetMeta = { id, kind, name: base, mime: mime || `${kind}/*`, size: blob.size, addedAt: Date.now() };
  if (kind === "image") {
    const bmp = await (isSvg(mime) ? svgBitmap(blob) : createImageBitmap(blob)).catch(() => {
      throw new Error(`“${name}” could not be decoded as an image.`);
    });
    meta.width = bmp.width;
    meta.height = bmp.height;
    bitmaps.set(id, bmp);
  } else if (kind === "video") {
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    Object.assign(meta, await probeVideo(url));
  } else {
    meta.family = `fs-${id}`;
    await registerFont(meta, blob).catch(() => {
      throw new Error(`“${name}” is not a valid font file.`);
    });
  }
  attach(meta, blob);
  void idbPut(meta, blob);
  changed();
  return meta;
}

/** Loads the stored library metadata (blobs load on demand). */
export async function loadLibrary(): Promise<void> {
  const metas = await idbListMeta();
  if (!metas.length) return;
  useAssets.setState((s) => {
    const assets = { ...s.assets };
    for (const m of metas) assets[m.id] ??= m;
    return { assets };
  });
  // Fonts register eagerly so text renders correctly on first use.
  await Promise.all(metas.filter((m) => m.kind === "font").map((m) => ensureAsset(m.id)));
}

/** Makes an asset's bytes available in memory (from IndexedDB). */
export function ensureAsset(id: string): Promise<boolean> {
  if (blobs.has(id)) return Promise.resolve(true);
  let p = pending.get(id) as Promise<boolean> | undefined;
  if (!p) {
    p = idbGetBlob(id).then((blob) => {
      const meta = useAssets.getState().assets[id];
      if (!blob || !meta) return false;
      attach(meta, blob);
      changed();
      return true;
    });
    pending.set(id, p);
    void p.finally(() => pending.delete(id));
  }
  return p;
}

export function assetMeta(id: string): AssetMeta | undefined {
  return useAssets.getState().assets[id];
}

export function assetBlob(id: string): Blob | undefined {
  return blobs.get(id);
}

export function assetUrl(id: string): string | null {
  const blob = blobs.get(id);
  if (!blob) {
    void ensureAsset(id);
    return null;
  }
  let url = urls.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(id, url);
  }
  return url;
}

/** Decoded image, or null while loading (listeners are notified when ready). */
export function assetBitmap(id: string): ImageBitmap | null {
  const bmp = bitmaps.get(id);
  if (bmp) return bmp;
  const blob = blobs.get(id);
  if (!blob) {
    void ensureAsset(id);
    return null;
  }
  const key = `bmp:${id}`;
  if (!pending.has(key)) {
    const p = (isSvg(useAssets.getState().assets[id]?.mime ?? blob.type) ? svgBitmap(blob) : createImageBitmap(blob))
      .then((b) => {
        bitmaps.set(id, b);
        changed();
      })
      .catch((e) => console.warn("Image decode failed", e))
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return null;
}

export async function assetBitmapAsync(id: string): Promise<ImageBitmap | null> {
  if (!(await ensureAsset(id))) return null;
  const now = assetBitmap(id);
  if (now) return now;
  await pending.get(`bmp:${id}`);
  return bitmaps.get(id) ?? null;
}

/** CSS font family for a font param value ("asset:<id>" or a system family). */
export function resolveFontFamily(value: string): string {
  if (!value.startsWith("asset:")) return value || "sans-serif";
  const id = value.slice(6);
  const meta = assetMeta(id);
  if (!blobs.has(id)) void ensureAsset(id);
  return meta?.family ?? "sans-serif";
}

export async function fontReady(value: string): Promise<void> {
  if (value.startsWith("asset:")) {
    const id = value.slice(6);
    await ensureAsset(id);
    await fonts.get(id)?.catch(() => undefined);
  } else {
    await document.fonts.load(`400 64px "${value}"`).catch(() => undefined);
  }
}

export async function removeAsset(id: string): Promise<void> {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  blobs.delete(id);
  bitmaps.get(id)?.close();
  bitmaps.delete(id);
  useAssets.setState((s) => {
    const assets = { ...s.assets };
    delete assets[id];
    return { assets };
  });
  await idbDelete(id);
  changed();
}

// ---------------------------------------------------------------------------
// References and packing (projects / preset files)

export function layerAssetIds(layer: Pick<LayerInstance, "generator" | "params">): string[] {
  const def = getGenerator(layer.generator);
  if (!def) return [];
  const ids: string[] = [];
  for (const p of def.params) {
    const v = layer.params[p.key];
    if (typeof v !== "string" || !v) continue;
    if (p.type === "asset") ids.push(v);
    else if (p.type === "font" && v.startsWith("asset:")) ids.push(v.slice(6));
  }
  return ids;
}

export function documentAssetIds(doc: Pick<FacadeDocument, "layers">): string[] {
  return [...new Set(doc.layers.flatMap((l) => layerAssetIds(l)))];
}

export async function ensureAssets(ids: string[]): Promise<string[]> {
  const ok = await Promise.all(ids.map((id) => ensureAsset(id)));
  return ids.filter((_, k) => !ok[k]);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return new Blob([bytes], { type: mime });
}

export async function packAssets(ids: string[]): Promise<PackedAsset[]> {
  await ensureAssets(ids);
  const out: PackedAsset[] = [];
  for (const id of ids) {
    const meta = assetMeta(id);
    const blob = blobs.get(id);
    if (meta && blob) out.push({ meta, data: await blobToBase64(blob) });
  }
  return out;
}

/** Adds bytes for a known id (project sidecar files, embedded preset assets). */
export async function restoreAsset(meta: AssetMeta, blob: Blob): Promise<void> {
  if (blobs.has(meta.id)) return;
  const m = { ...meta, family: meta.kind === "font" ? `fs-${meta.id}` : meta.family };
  if (m.kind === "video" && (!m.duration || !m.width)) {
    const url = URL.createObjectURL(blob);
    urls.set(m.id, url);
    Object.assign(m, await probeVideo(url).catch(() => ({})));
  }
  attach(m, blob);
  if (m.kind === "font") await fonts.get(m.id)?.catch(() => undefined);
  void idbPut(m, blob);
  changed();
}

export async function unpackAssets(list: PackedAsset[] | undefined): Promise<void> {
  if (!Array.isArray(list)) return;
  for (const a of list) {
    if (!a?.meta?.id || typeof a.data !== "string") continue;
    await restoreAsset(a.meta, base64ToBlob(a.data, a.meta.mime));
  }
}

export function fileExtension(meta: AssetMeta): string {
  const fromMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "font/ttf": "ttf",
    "font/otf": "otf",
    "font/woff": "woff",
    "font/woff2": "woff2",
  };
  return fromMime[meta.mime] ?? (meta.kind === "font" ? "ttf" : meta.kind === "video" ? "mp4" : "png");
}
