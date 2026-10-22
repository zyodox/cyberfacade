import { create } from "zustand";
import { clock } from "../animation/clock";
import { localStore, type SavedLayer } from "../persistence/local";
import { layerToPresetLayer, normalizeLayer, presetToDocument } from "../presets/normalize";
import { randomSeed } from "../presets/random";
import { randomizeDocument, type LockSet } from "../presets/randomize";
import { builtInPresets, DEFAULT_PRESET_ID } from "../presets/registry";
import type { PresetDef, PresetLayer } from "../presets/types";
import type { ParamValue } from "../procedural/params";
import type { AnimationSettings, Architecture, AudioRoute, FacadeDocument, LayerInstance, LookSettings, OutputSettings } from "../procedural/types";
import type { PreviewChannel } from "../renderer/types";
import type { Primitive } from "../preview3d/geometry";

export type PreviewQuality = "auto" | "512" | "1024" | "2048" | "full";

/** 3D preview settings — view only; the 3D view never changes the document. */
export interface View3DState {
  primitive: Primitive;
  /** Derive building proportions from the texture aspect so windows keep their shape. */
  matchAspect: boolean;
  autoRotate: boolean;
  fov: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  reflections: number;
  fog: number;
  /** Facade light scattering in the air (Blade Runner haze). */
  haze: number;
  rain: number;
  environment: number;
  /** "auto" = matte when the design has a Concrete layer. */
  surface: "auto" | "glass" | "concrete";
  sky: "night" | "bluehour";
  /** Additional exposure (EV) for the 3D view. */
  exposure: number;
  /** Incremented to ask the preview to reset its orbit camera. */
  cameraReset: number;
}

export interface ViewState {
  mode: "2d" | "3d" | "graph";
  /** When set, the preview shows the stack only up to (and including) this layer. */
  previewUpTo: string | null;
  channel: PreviewChannel;
  tile: boolean;
  /** When true the view refits on resize / output change. */
  fit: boolean;
  /** CSS pixels per output-texture pixel. */
  scale: number;
  center: [number, number];
  quality: PreviewQuality;
}

export interface AppState {
  doc: FacadeDocument;
  /** Pristine document of the loaded preset — the anchor for RANDOMIZE and reset. */
  baseDoc: FacadeDocument;
  preset: PresetDef | null;
  userPresets: PresetDef[];
  /** Layers the user saved for reuse. */
  myLayers: SavedLayer[];
  selectedLayerId: string | null;
  locks: LockSet;
  playing: boolean;
  loop: boolean;
  view: ViewState;
  view3d: View3DState;
  favorites: string[];
  recents: string[];
  /** Path of the open .facade project, if saved. */
  projectPath: string | null;
  modal: "export" | "savePreset" | null;

  loadPreset(p: PresetDef): void;
  /** Empty stack — the start of a from-scratch design. */
  newBlank(): void;
  /** Inserts a ready-made layer (element recipe, saved layer) after the selection. */
  insertLayer(data: Omit<PresetLayer, "id">, index?: number): string | null;
  saveLayerToLibrary(layerId: string, name?: string): void;
  removeMyLayer(id: string): void;
  loadProject(doc: FacadeDocument, preset: PresetDef | null, locks: LockSet, path: string | null): void;
  setProjectPath(path: string | null): void;
  setModal(modal: AppState["modal"]): void;
  addUserPreset(p: PresetDef): void;
  removeUserPreset(id: string): void;
  resetToPreset(): void;
  setSeed(seed: number): void;
  newSeed(): void;
  patchArchitecture(patch: Partial<Architecture>): void;
  patchAnimation(patch: Partial<AnimationSettings>): void;
  patchLook(patch: Partial<LookSettings>): void;
  patchOutput(patch: Partial<OutputSettings>): void;
  setParam(layerId: string, key: string, value: ParamValue): void;
  patchLayer(layerId: string, patch: Partial<Omit<LayerInstance, "params" | "id" | "generator">>): void;
  moveLayer(layerId: string, delta: number): void;
  addLayer(generatorId: string, index?: number): void;
  moveLayerTo(layerId: string, index: number): void;
  removeLayer(layerId: string): void;
  duplicateLayer(layerId: string): void;
  selectLayer(id: string | null): void;
  addAudioRoute(route: Omit<AudioRoute, "id">): void;
  patchAudioRoute(id: string, patch: Partial<AudioRoute>): void;
  removeAudioRoute(id: string): void;
  toggleLock(path: string): void;
  randomize(): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  setLoop(loop: boolean): void;
  patchView(patch: Partial<ViewState>): void;
  patchView3D(patch: Partial<View3DState>): void;
  toggleFavorite(id: string): void;
}

const initialPreset = builtInPresets().find((p) => p.id === DEFAULT_PRESET_ID) ?? builtInPresets()[0];
const initialDoc = presetToDocument(initialPreset);

const newLayerId = (generator: string) => `${generator}-${Math.random().toString(36).slice(2, 7)}`;

const mapLayer = (doc: FacadeDocument, id: string, fn: (l: LayerInstance) => LayerInstance): FacadeDocument => ({
  ...doc,
  layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)),
});

export const useApp = create<AppState>()((set, get) => ({
  doc: initialDoc,
  baseDoc: initialDoc,
  preset: initialPreset,
  userPresets: localStore.loadUserPresets(),
  myLayers: localStore.loadMyLayers(),
  selectedLayerId: initialDoc.layers[0]?.id ?? null,
  locks: {},
  playing: true,
  loop: true,
  view: { mode: "2d", previewUpTo: null, channel: "color", tile: false, fit: true, scale: 0.4, center: [0.5, 0.5], quality: "auto" },
  view3d: {
    primitive: "skyscraper",
    matchAspect: true,
    autoRotate: true,
    fov: 38,
    bloom: 0.8,
    bloomThreshold: 0.9,
    bloomRadius: 0.5,
    reflections: 0.8,
    fog: 0.4,
    haze: 0.35,
    rain: 0,
    environment: 1,
    surface: "auto",
    sky: "bluehour",
    exposure: 0,
    cameraReset: 0,
  },
  favorites: localStore.loadFavorites(),
  recents: localStore.loadRecents(),
  projectPath: null,
  modal: null,

  loadProject(doc, preset, locks, path) {
    const baseDoc = preset ? presetToDocument(preset) : structuredClone(doc);
    set((s) => ({ doc, baseDoc, preset, locks, projectPath: path, selectedLayerId: doc.layers[0]?.id ?? null, view: { ...s.view, fit: true, previewUpTo: null } }));
    clock.set(Math.min(clock.time, doc.animation.duration));
  },

  setProjectPath(projectPath) {
    set({ projectPath });
  },

  setModal(modal) {
    set({ modal });
  },

  addUserPreset(p) {
    const userPresets = [...get().userPresets.filter((u) => u.id !== p.id), { ...p, user: true }];
    localStore.saveUserPresets(userPresets);
    set({ userPresets });
  },

  removeUserPreset(id) {
    const userPresets = get().userPresets.filter((u) => u.id !== id);
    localStore.saveUserPresets(userPresets);
    set({ userPresets });
  },

  loadPreset(p) {
    const doc = presetToDocument(p);
    const recents = [p.id, ...get().recents.filter((id) => id !== p.id)].slice(0, 12);
    localStore.saveRecents(recents);
    set((s) => ({
      doc,
      baseDoc: doc,
      preset: p,
      locks: {},
      recents,
      projectPath: null,
      selectedLayerId: doc.layers[0]?.id ?? null,
      view: { ...s.view, fit: true, previewUpTo: null },
    }));
    clock.set(Math.min(clock.time, doc.animation.duration));
  },

  newBlank() {
    const doc = presetToDocument({
      schema: 1,
      id: "blank",
      name: "Untitled design",
      category: "Realistic Buildings",
      seed: randomSeed(),
      architecture: { floors: 40, bays: 14, facades: 1, slab: 0.2, mullion: 0.1, symmetry: "none" },
      animation: { duration: 10, speed: 1 },
      output: { width: 1024, height: 2048 },
      layers: [],
    });
    doc.presetId = null;
    set((s) => ({ doc, baseDoc: doc, preset: null, locks: {}, projectPath: null, selectedLayerId: null, view: { ...s.view, fit: true, previewUpTo: null } }));
  },

  insertLayer(data, index) {
    const layer = normalizeLayer({ ...structuredClone(data), id: newLayerId(data.generator) });
    if (!layer) return null;
    set((s) => {
      const layers = [...s.doc.layers];
      const sel = layers.findIndex((l) => l.id === s.selectedLayerId);
      const at = index ?? (sel < 0 ? layers.length : sel + 1);
      layers.splice(Math.max(0, Math.min(layers.length, at)), 0, layer);
      return { doc: { ...s.doc, layers }, selectedLayerId: layer.id };
    });
    return layer.id;
  },

  saveLayerToLibrary(layerId, name) {
    const l = get().doc.layers.find((x) => x.id === layerId);
    if (!l) return;
    const entry: SavedLayer = { id: `ml-${Date.now().toString(36)}`, name: name ?? l.name, layer: layerToPresetLayer(l), savedAt: Date.now() };
    const myLayers = [entry, ...get().myLayers];
    localStore.saveMyLayers(myLayers);
    set({ myLayers });
  },

  removeMyLayer(id) {
    const myLayers = get().myLayers.filter((m) => m.id !== id);
    localStore.saveMyLayers(myLayers);
    set({ myLayers });
  },

  resetToPreset() {
    const { baseDoc } = get();
    set({ doc: structuredClone(baseDoc) });
  },

  setSeed(seed) {
    set((s) => ({ doc: { ...s.doc, seed: Math.max(0, Math.floor(seed)) >>> 0 } }));
  },

  newSeed() {
    get().setSeed(randomSeed());
  },

  patchArchitecture(patch) {
    set((s) => ({ doc: { ...s.doc, architecture: { ...s.doc.architecture, ...patch } } }));
  },

  patchAnimation(patch) {
    set((s) => ({ doc: { ...s.doc, animation: { ...s.doc.animation, ...patch } } }));
  },

  patchLook(patch) {
    set((s) => ({ doc: { ...s.doc, look: { ...s.doc.look, ...patch } } }));
  },

  patchOutput(patch) {
    set((s) => ({ doc: { ...s.doc, output: { ...s.doc.output, ...patch } }, view: { ...s.view, fit: true } }));
  },

  setParam(layerId, key, value) {
    set((s) => ({ doc: mapLayer(s.doc, layerId, (l) => ({ ...l, params: { ...l.params, [key]: value } })) }));
  },

  patchLayer(layerId, patch) {
    set((s) => ({ doc: mapLayer(s.doc, layerId, (l) => ({ ...l, ...patch })) }));
  },

  moveLayer(layerId, delta) {
    set((s) => {
      const layers = [...s.doc.layers];
      const i = layers.findIndex((l) => l.id === layerId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= layers.length) return {};
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { doc: { ...s.doc, layers } };
    });
  },

  addLayer(generatorId, index) {
    const layer = normalizeLayer({ id: newLayerId(generatorId), generator: generatorId });
    if (!layer) return;
    set((s) => {
      // Insert at `index`, else after the selected layer, else at the end.
      const layers = [...s.doc.layers];
      const sel = layers.findIndex((l) => l.id === s.selectedLayerId);
      const at = index ?? (sel < 0 ? layers.length : sel + 1);
      layers.splice(Math.max(0, Math.min(layers.length, at)), 0, layer);
      return { doc: { ...s.doc, layers }, selectedLayerId: layer.id };
    });
  },

  moveLayerTo(layerId, index) {
    set((s) => {
      const layers = [...s.doc.layers];
      const i = layers.findIndex((l) => l.id === layerId);
      if (i < 0) return {};
      const [l] = layers.splice(i, 1);
      layers.splice(Math.max(0, Math.min(layers.length, index > i ? index - 1 : index)), 0, l);
      return { doc: { ...s.doc, layers } };
    });
  },

  removeLayer(layerId) {
    set((s) => {
      const i = s.doc.layers.findIndex((l) => l.id === layerId);
      const layers = s.doc.layers.filter((l) => l.id !== layerId);
      const next = layers[Math.min(i, layers.length - 1)]?.id ?? null;
      return {
        doc: { ...s.doc, layers },
        selectedLayerId: s.selectedLayerId === layerId ? next : s.selectedLayerId,
        view: s.view.previewUpTo === layerId ? { ...s.view, previewUpTo: null } : s.view,
      };
    });
  },

  duplicateLayer(layerId) {
    set((s) => {
      const i = s.doc.layers.findIndex((l) => l.id === layerId);
      if (i < 0) return {};
      const src = s.doc.layers[i];
      const copy = { ...structuredClone(src), id: newLayerId(src.generator), name: `${src.name} copy` };
      const layers = [...s.doc.layers];
      layers.splice(i + 1, 0, copy);
      return { doc: { ...s.doc, layers }, selectedLayerId: copy.id };
    });
  },

  selectLayer(id) {
    set({ selectedLayerId: id });
  },

  addAudioRoute(route) {
    const r = { ...route, id: `route-${Math.random().toString(36).slice(2, 7)}` };
    set((s) => ({ doc: { ...s.doc, audio: { routes: [...s.doc.audio.routes, r] } } }));
  },

  patchAudioRoute(id, patch) {
    set((s) => ({ doc: { ...s.doc, audio: { routes: s.doc.audio.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) } } }));
  },

  removeAudioRoute(id) {
    set((s) => ({ doc: { ...s.doc, audio: { routes: s.doc.audio.routes.filter((r) => r.id !== id) } } }));
  },

  toggleLock(path) {
    set((s) => {
      const locks = { ...s.locks };
      if (locks[path]) delete locks[path];
      else locks[path] = true;
      return { locks };
    });
  },

  randomize() {
    const { doc, baseDoc, preset, locks } = get();
    set({ doc: randomizeDocument(doc, baseDoc, preset, locks, randomSeed()) });
  },

  setPlaying(playing) {
    set({ playing });
  },

  togglePlaying() {
    set((s) => ({ playing: !s.playing }));
  },

  setLoop(loop) {
    set({ loop });
  },

  patchView(patch) {
    set((s) => ({ view: { ...s.view, ...patch } }));
  },

  patchView3D(patch) {
    set((s) => ({ view3d: { ...s.view3d, ...patch } }));
  },

  toggleFavorite(id) {
    const favs = get().favorites;
    const favorites = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    localStore.saveFavorites(favorites);
    set({ favorites });
  },
}));
