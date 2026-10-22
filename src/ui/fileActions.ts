import { assetBlob, assetMeta, documentAssetIds, ensureAsset, ensureAssets, fileExtension, packAssets, restoreAsset, unpackAssets } from "../assets/assets";
import { fileSize, isDesktop, joinPath, pickOpenPath, pickSavePath, readBinaryFile, readTextFile, safeFileName, writeBinaryFile, writeTextFile } from "../platform/native";
import { parsePresetFile, parseProject, PRESET_EXT, PROJECT_EXT, serializePresetFile, serializeProject, type ProjectAssetRef } from "../persistence/project";
import { documentToPreset } from "../presets/normalize";
import { useApp } from "../state/store";
import { toast, toastError } from "./toastStore";

function desktopOnly(): boolean {
  if (isDesktop()) return true;
  toast("Saving and opening files is available in the desktop app.", "info");
  return false;
}

const dirOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
const baseOf = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");

export async function openProject(): Promise<void> {
  if (!desktopOnly()) return;
  try {
    const path = await pickOpenPath("Open project", "CyberFacade project", [PROJECT_EXT, "json"]);
    if (!path) return;
    const { doc, preset, locks, assets } = parseProject(await readTextFile(path));
    // Imported files live beside the project; the library copy is used when present.
    const missing: string[] = [];
    for (const a of assets) {
      if (await ensureAsset(a.meta.id)) continue;
      try {
        const bytes = await readBinaryFile(joinPath(dirOf(path), a.file));
        await restoreAsset(a.meta, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: a.meta.mime }));
      } catch {
        missing.push(a.meta.name);
      }
    }
    useApp.getState().loadProject(doc, preset, locks, path);
    if (missing.length) toast(`Opened, but these files were not found beside the project: ${missing.join(", ")}`, "info");
    else toast(`Opened ${path}`, "success");
  } catch (e) {
    toastError(e);
  }
}

export async function saveProject(saveAs = false): Promise<void> {
  if (!desktopOnly()) return;
  try {
    const s = useApp.getState();
    let path = saveAs ? null : s.projectPath;
    if (!path) path = await pickSavePath("Save project", `${safeFileName(s.doc.name)}.${PROJECT_EXT}`, "CyberFacade project", PROJECT_EXT);
    if (!path) return;

    // Copy imported files into "<project>_assets/" (skipped when already there).
    const ids = documentAssetIds(s.doc);
    const lost = await ensureAssets(ids);
    const folder = `${baseOf(path)}_assets`;
    const refs: ProjectAssetRef[] = [];
    for (const id of ids) {
      const meta = assetMeta(id);
      const blob = assetBlob(id);
      if (!meta || !blob || lost.includes(id)) continue;
      const rel = `${folder}/${id}.${fileExtension(meta)}`;
      const abs = joinPath(dirOf(path), folder, `${id}.${fileExtension(meta)}`);
      if ((await fileSize(abs)) !== blob.size) await writeBinaryFile(abs, new Uint8Array(await blob.arrayBuffer()));
      refs.push({ meta, file: rel });
    }
    await writeTextFile(path, serializeProject(s.doc, s.preset, s.locks, refs));
    s.setProjectPath(path);
    toast(refs.length ? `Saved ${path} (+${refs.length} imported file${refs.length > 1 ? "s" : ""} in ${folder})` : `Saved ${path}`, "success");
  } catch (e) {
    toastError(e);
  }
}

export async function importPreset(): Promise<void> {
  if (!desktopOnly()) return;
  try {
    const path = await pickOpenPath("Import preset", "CyberFacade preset", [PRESET_EXT, "json"]);
    if (!path) return;
    const { preset, assets } = parsePresetFile(await readTextFile(path));
    await unpackAssets(assets);
    useApp.getState().addUserPreset(preset);
    useApp.getState().loadPreset({ ...preset, user: true });
    toast(`Imported preset “${preset.name}”${assets.length ? ` with ${assets.length} file${assets.length > 1 ? "s" : ""}` : ""}`, "success");
  } catch (e) {
    toastError(e);
  }
}

export async function exportPresetFile(): Promise<void> {
  if (!desktopOnly()) return;
  try {
    const s = useApp.getState();
    const meta = {
      id: s.preset?.user ? s.preset.id : `user-${Date.now().toString(36)}`,
      name: s.doc.name,
      category: s.preset?.category ?? "Realistic Buildings",
      description: s.preset?.description,
      tags: s.preset?.tags,
    } as const;
    const path = await pickSavePath("Export preset", `${safeFileName(s.doc.name)}.${PRESET_EXT}`, "CyberFacade preset", PRESET_EXT);
    if (!path) return;
    const assets = await packAssets(documentAssetIds(s.doc));
    await writeTextFile(path, serializePresetFile(documentToPreset(s.doc, meta), assets));
    toast(`Exported preset to ${path}${assets.length ? ` (with ${assets.length} embedded file${assets.length > 1 ? "s" : ""})` : ""}`, "success");
  } catch (e) {
    toastError(e);
  }
}
