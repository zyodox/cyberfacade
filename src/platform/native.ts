/**
 * Native (Tauri) file access. Everything that touches the file system goes
 * through here so the rest of the app stays platform-agnostic.
 */
import { invoke } from "@tauri-apps/api/core";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function requireDesktop(): void {
  if (!isDesktop()) throw new Error("File access is only available in the CyberFacade desktop app.");
}

export type ImageFileFormat = "png8" | "exr";

/** Encodes and writes an image on a native worker thread (PNG or half-float ZIP EXR). */
export async function writeImageFile(path: string, format: ImageFileFormat, width: number, height: number, channels: 1 | 3 | 4, data: Uint8Array): Promise<void> {
  requireDesktop();
  await invoke("write_image", data, {
    headers: {
      "x-path": encodeURIComponent(path),
      "x-format": format,
      "x-width": String(width),
      "x-height": String(height),
      "x-channels": String(channels),
    },
  });
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  requireDesktop();
  await invoke("write_file", data, { headers: { "x-path": encodeURIComponent(path) } });
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  await writeBinaryFile(path, new TextEncoder().encode(text));
}

export async function readTextFile(path: string): Promise<string> {
  requireDesktop();
  return invoke<string>("read_text_file", { path });
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  requireDesktop();
  const buf = await invoke<ArrayBuffer | number[]>("read_file", { path });
  return buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf);
}

export async function fileSize(path: string): Promise<number | null> {
  requireDesktop();
  return invoke<number | null>("file_size", { path });
}

/** Whether a file or folder exists at `path`. */
export async function pathExists(path: string): Promise<boolean> {
  requireDesktop();
  return invoke<boolean>("path_exists", { path });
}

export async function pickFolder(title: string): Promise<string | null> {
  requireDesktop();
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(title: string, defaultPath: string, filterName: string, ext: string): Promise<string | null> {
  requireDesktop();
  const { save } = await import("@tauri-apps/plugin-dialog");
  const r = await save({ title, defaultPath, filters: [{ name: filterName, extensions: [ext] }] });
  return r ?? null;
}

export async function pickOpenPath(title: string, filterName: string, exts: string[]): Promise<string | null> {
  requireDesktop();
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ title, multiple: false, directory: false, filters: [{ name: filterName, extensions: exts }] });
  return typeof r === "string" ? r : null;
}

export function joinPath(folder: string, ...parts: string[]): string {
  const sep = folder.includes("\\") || !folder.includes("/") ? "\\" : "/";
  return [folder.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "facade";
}
