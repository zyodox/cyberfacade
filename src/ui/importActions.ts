/**
 * Importing photos, videos and fonts: file pickers, drag & drop, and turning
 * an imported file into a layer (billboard / video screen / font on a sign).
 */
import { ACCEPT, importAsset, kindOfFile, type AssetKind, type AssetMeta } from "../assets/assets";
import { isSvg } from "../assets/logoRaster";
import { useApp } from "../state/store";
import { ELEMENTS, type ElementRecipe } from "./elements";
import { toast, toastError } from "./toastStore";

/** Opens the system file picker; resolves [] when cancelled. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => done([]));
    input.click();
  });
}

const acceptFor = (kind: AssetKind | "media" | "any") =>
  kind === "media" ? `${ACCEPT.image},${ACCEPT.video}` : kind === "any" ? `${ACCEPT.image},${ACCEPT.video},${ACCEPT.font}` : ACCEPT[kind];

export async function importFiles(files: File[]): Promise<AssetMeta[]> {
  const out: AssetMeta[] = [];
  for (const file of files) {
    try {
      out.push(await importAsset(file, file.name, file.type));
    } catch (e) {
      toastError(e);
    }
  }
  return out;
}

const recipe = (id: string) => ELEMENTS.find((e) => e.id === id)!;

/** Puts an imported asset into the design: image/video → new layer, font → selected sign (or a new one). */
export function placeAsset(meta: AssetMeta, base?: ElementRecipe): void {
  const s = useApp.getState();
  if (meta.kind === "font") {
    const sel = s.doc.layers.find((l) => l.id === s.selectedLayerId);
    if (sel?.generator === "sign") {
      s.setParam(sel.id, "font", `asset:${meta.id}`);
      toast(`Font “${meta.name}” applied to “${sel.name}”`, "success");
    } else {
      const r = recipe("neon-word");
      s.insertLayer({ ...r.layer, name: meta.name, params: { ...r.layer.params, font: `asset:${meta.id}`, text: meta.name, posX: 0.5, posY: 0.5, size: 0.1 } });
    }
    return;
  }
  // A photo imported into an empty design (or placed as Facade photo) is the facade itself, with animated lights.
  if (meta.kind === "image" && !isSvg(meta.mime) && (base?.id === "facade-photo" || (!base && s.doc.layers.length === 0))) {
    placeFacadePhoto(meta);
    return;
  }
  // SVG artwork becomes a neon logo that draws itself on; photos a billboard; clips a screen.
  const r = base ?? recipe(meta.kind === "video" ? "video-screen" : isSvg(meta.mime) ? "neon-logo" : "billboard");
  s.insertLayer({ ...r.layer, name: meta.name || r.layer.name, params: { ...r.layer.params, file: meta.id } });
}

/** The photo fills the texture (output takes its proportions, same long side) and Photo Lights animates its lit windows. */
function placeFacadePhoto(meta: AssetMeta): void {
  const s = useApp.getState();
  const r = recipe("facade-photo");
  if (meta.width && meta.height) {
    const long = Math.max(s.doc.output.width, s.doc.output.height);
    const a = meta.width / meta.height;
    const r8 = (v: number) => Math.max(16, Math.round(v / 8) * 8);
    const out = a >= 1 ? { width: r8(long), height: r8(long / a) } : { width: r8(long * a), height: r8(long) };
    if (out.width !== s.doc.output.width || out.height !== s.doc.output.height) s.patchOutput(out);
  }
  s.insertLayer({ ...r.layer, name: meta.name || r.layer.name, params: { ...r.layer.params, file: meta.id } });
  addPhotoLights();
  toast("Photo Lights added: the lit windows now animate. Tune it with “Show detected lights” in its settings.", "info", 7000);
}

/** Adds Photo Lights right after the selected layer (the photo) — or selects the one already there. */
export function addPhotoLights(): void {
  const s = useApp.getState();
  const i = s.doc.layers.findIndex((l) => l.id === s.selectedLayerId);
  const next = i >= 0 ? s.doc.layers[i + 1] : undefined;
  if (next?.generator === "photolights") {
    s.selectLayer(next.id);
    return;
  }
  s.insertLayer(recipe("photo-lights").layer);
}

/** Playlist elements: every picked file becomes an item (up to six). */
const PLAYLIST_KEYS = ["file", "file2", "file3", "file4", "file5", "file6"];

/** File ▸ Import: pick files of a kind and place each one. */
export async function importAndPlace(kind: AssetKind | "media" | "any" = "any"): Promise<void> {
  const files = await pickFiles(acceptFor(kind));
  const metas = await importFiles(files);
  metas.forEach((m) => placeAsset(m));
  if (metas.length) toast(`Imported ${metas.map((m) => m.name).join(", ")}`, "success");
}

/** Adds an element; elements that need a file ask for it first. */
export async function addElement(r: ElementRecipe): Promise<void> {
  if (!r.needs) {
    useApp.getState().insertLayer(r.layer);
    return;
  }
  const playlist = r.layer.generator === "media" && "transition" in (r.layer.params ?? {});
  const files = await pickFiles(acceptFor(r.needs), playlist);
  if (!files.length) return;
  const metas = (await importFiles(files)).filter((m) => m.kind !== "font");
  if (playlist && metas.length > 1) {
    const items = Object.fromEntries(metas.slice(0, 6).map((m, k) => [PLAYLIST_KEYS[k], m.id]));
    useApp.getState().insertLayer({ ...r.layer, params: { ...r.layer.params, ...items } });
    return;
  }
  if (metas[0]) placeAsset(metas[0], r);
}

/** Window-wide drag & drop of images, videos and fonts. */
export function installDropImport(): () => void {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
  const onOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
    document.body.classList.add("drop-target");
  };
  const onLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) document.body.classList.remove("drop-target");
  };
  const onDrop = async (e: DragEvent) => {
    document.body.classList.remove("drop-target");
    if (!hasFiles(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer!.files).filter((f) => kindOfFile(f.name, f.type));
    if (!files.length) {
      toast("Drop images (PNG/JPG/WebP/SVG), videos (MP4/WebM) or fonts (TTF/OTF/WOFF).", "info");
      return;
    }
    const metas = await importFiles(files);
    metas.forEach((m) => placeAsset(m));
    if (metas.length) toast(`Imported ${metas.map((m) => m.name).join(", ")}`, "success");
  };
  window.addEventListener("dragover", onOver);
  window.addEventListener("dragleave", onLeave);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onOver);
    window.removeEventListener("dragleave", onLeave);
    window.removeEventListener("drop", onDrop);
  };
}
