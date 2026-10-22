import { PRESET_CATEGORIES, type PresetDef } from "./types";

// Built-in presets are JSON data files; dropping a new file into ./library adds it.
const modules = import.meta.glob<PresetDef>("./library/*.json", { eager: true, import: "default" });

const builtIn: PresetDef[] = Object.values(modules)
  .filter((p) => p && p.schema === 1 && Array.isArray(p.layers))
  .sort((a, b) => PRESET_CATEGORIES.indexOf(a.category) - PRESET_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));

export function builtInPresets(): PresetDef[] {
  return builtIn;
}

export const DEFAULT_PRESET_ID = "luxury-futuristic-facade";
