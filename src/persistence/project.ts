/**
 * Project (.facade) and preset (.facadepreset) files. Both are JSON; loading
 * always re-normalizes against the current generator schemas, so files from
 * older versions (missing params, removed layers) still open.
 */
import { documentToPreset, presetToDocument } from "../presets/normalize";
import type { LockSet } from "../presets/randomize";
import { PRESET_CATEGORIES, type PresetDef } from "../presets/types";
import type { FacadeDocument } from "../procedural/types";
import type { AssetMeta, PackedAsset } from "../assets/assets";

export const PROJECT_EXT = "facade";
export const PRESET_EXT = "facadepreset";

/** An imported file used by the project, stored beside it (path relative to the project file). */
export interface ProjectAssetRef {
  meta: AssetMeta;
  file: string;
}

export interface ProjectFileV1 {
  format: "facade-studio-project";
  version: 1;
  savedAt: string;
  document: FacadeDocument;
  /** The preset the document was derived from (anchor for RANDOMIZE / reset). */
  preset: PresetDef | null;
  locks: LockSet;
  assets?: ProjectAssetRef[];
}

export function serializeProject(doc: FacadeDocument, preset: PresetDef | null, locks: LockSet, assets: ProjectAssetRef[] = []): string {
  const file: ProjectFileV1 = { format: "facade-studio-project", version: 1, savedAt: new Date().toISOString(), document: doc, preset, locks, assets };
  return JSON.stringify(file, null, 2);
}

/** Preset file (.facadepreset) — imported files are embedded so the preset is self-contained. */
export function serializePresetFile(preset: PresetDef, assets: PackedAsset[]): string {
  return JSON.stringify({ ...preset, user: undefined, assets: assets.length ? assets : undefined }, null, 2);
}

/** Round-trips a document through the preset normalizer to validate every field. */
export function normalizeDocument(doc: FacadeDocument): FacadeDocument {
  const p = documentToPreset(doc, { id: doc.presetId ?? "project", name: doc.name, category: "Realistic Buildings" });
  return { ...presetToDocument(p), presetId: doc.presetId, name: doc.name };
}

export function parseProject(text: string): { doc: FacadeDocument; preset: PresetDef | null; locks: LockSet; assets: ProjectAssetRef[] } {
  const raw = JSON.parse(text) as Partial<ProjectFileV1>;
  if (raw.format !== "facade-studio-project" || !raw.document) throw new Error("Not a CyberFacade project file.");
  return {
    doc: normalizeDocument(raw.document),
    preset: raw.preset && Array.isArray(raw.preset.layers) ? raw.preset : null,
    locks: raw.locks && typeof raw.locks === "object" ? raw.locks : {},
    assets: Array.isArray(raw.assets) ? raw.assets.filter((a) => a?.meta?.id && typeof a.file === "string") : [],
  };
}

export function parsePresetFile(text: string): { preset: PresetDef; assets: PackedAsset[] } {
  const raw = JSON.parse(text) as Partial<PresetDef> & { assets?: PackedAsset[] };
  if (raw.schema !== 1 || !Array.isArray(raw.layers) || typeof raw.name !== "string") throw new Error("Not a CyberFacade preset file.");
  const category = PRESET_CATEGORIES.includes(raw.category as never) ? raw.category! : "Realistic Buildings";
  const { assets, ...rest } = raw;
  // Validate by normalizing; keep the original data (it stays forward-compatible).
  presetToDocument({ ...(rest as PresetDef), category });
  return { preset: { ...(rest as PresetDef), category, id: raw.id ?? `user-${Date.now().toString(36)}` }, assets: Array.isArray(assets) ? assets : [] };
}
