/**
 * Small per-user conveniences (favorites, recents, user presets) kept in
 * localStorage. Every access is guarded: storage can be unavailable or cleared.
 */
import type { PresetDef, PresetLayer } from "../presets/types";

const KEY = {
  favorites: "facade-studio.favorites",
  recents: "facade-studio.recents",
  userPresets: "facade-studio.user-presets",
  myLayers: "facade-studio.my-layers",
  leftTab: "facade-studio.left-tab",
};

/** A layer saved by the user for reuse ("My layers"). */
export interface SavedLayer {
  id: string;
  name: string;
  layer: PresetLayer;
  savedAt: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export const localStore = {
  loadFavorites: () => read<string[]>(KEY.favorites, []),
  saveFavorites: (ids: string[]) => write(KEY.favorites, ids),
  loadRecents: () => read<string[]>(KEY.recents, []),
  saveRecents: (ids: string[]) => write(KEY.recents, ids),
  loadUserPresets: () => read<PresetDef[]>(KEY.userPresets, []),
  saveUserPresets: (presets: PresetDef[]) => write(KEY.userPresets, presets),
  loadMyLayers: () => read<SavedLayer[]>(KEY.myLayers, []),
  saveMyLayers: (layers: SavedLayer[]) => write(KEY.myLayers, layers),
  loadLeftTab: () => read<string>(KEY.leftTab, "build"),
  saveLeftTab: (tab: string) => write(KEY.leftTab, tab),
};
