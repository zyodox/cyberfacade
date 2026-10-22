import { clampParam } from "../procedural/params";
import { getGenerator } from "../procedural/registry";
import {
  AUDIO_BANDS,
  BLEND_MODES,
  DEFAULT_ARCHITECTURE,
  DEFAULT_REGION,
  DEFAULT_REGION_X,
  DEFAULT_TIME_SHIFT,
  SYMMETRY_MODES,
  TONEMAPS,
  type FacadeDocument,
  type LayerInstance,
} from "../procedural/types";
import type { PresetDef, PresetLayer } from "./types";

const clamp = (v: unknown, lo: number, hi: number, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;

export function normalizeLayer(l: PresetLayer): LayerInstance | null {
  const def = getGenerator(l.generator);
  if (!def) {
    console.warn(`Preset layer "${l.id}" uses unknown generator "${l.generator}" — skipped.`);
    return null;
  }
  const params: LayerInstance["params"] = {};
  for (const p of def.params) params[p.key] = clampParam(p, l.params?.[p.key]);
  return {
    id: l.id,
    generator: def.id,
    name: l.name ?? def.label,
    enabled: l.enabled ?? true,
    blend: l.blend && BLEND_MODES.includes(l.blend) ? l.blend : def.defaultBlend,
    opacity: clamp(l.opacity, 0, 1, 1),
    clip: l.clip ?? false,
    region: {
      min: clamp(l.region?.min, 0, 1, DEFAULT_REGION.min),
      max: clamp(l.region?.max, 0, 1, DEFAULT_REGION.max),
      soft: clamp(l.region?.soft, 0, 0.5, DEFAULT_REGION.soft),
      invert: l.region?.invert ?? false,
    },
    regionX: {
      min: clamp(l.regionX?.min, 0, 1, DEFAULT_REGION_X.min),
      max: clamp(l.regionX?.max, 0, 1, DEFAULT_REGION_X.max),
      soft: clamp(l.regionX?.soft, 0, 0.5, DEFAULT_REGION_X.soft),
    },
    timeShift: {
      y: clamp(l.timeShift?.y, -4, 4, DEFAULT_TIME_SHIFT.y),
      x: clamp(l.timeShift?.x, -4, 4, DEFAULT_TIME_SHIFT.x),
      quantize: l.timeShift?.quantize ?? DEFAULT_TIME_SHIFT.quantize,
    },
    params,
  };
}

/** Preset (possibly partial / older / user-authored) → complete, valid document. */
export function presetToDocument(p: PresetDef): FacadeDocument {
  const a = { ...DEFAULT_ARCHITECTURE, ...p.architecture };
  const doc: FacadeDocument = {
    name: p.name,
    presetId: p.id,
    seed: Math.floor(clamp(p.seed, 0, 2 ** 31 - 1, 1337)),
    architecture: {
      floors: Math.round(clamp(a.floors, 1, 400, 32)),
      bays: Math.round(clamp(a.bays, 1, 200, 10)),
      facades: Math.round(clamp(a.facades, 1, 8, 1)),
      slab: clamp(a.slab, 0, 0.9, 0.18),
      mullion: clamp(a.mullion, 0, 0.9, 0.08),
      symmetry: SYMMETRY_MODES.includes(a.symmetry) ? a.symmetry : "none",
    },
    animation: {
      duration: clamp(p.animation?.duration, 2, 15, 8),
      speed: clamp(p.animation?.speed, 0.1, 4, 1),
    },
    look: {
      emission: clamp(p.look?.emission, 0, 20, 1),
      exposure: clamp(p.look?.exposure, -8, 8, 0),
      tonemap: p.look?.tonemap && TONEMAPS.includes(p.look.tonemap) ? p.look.tonemap : "agx",
    },
    output: {
      width: Math.round(clamp(p.output?.width, 16, 8192, 1024)),
      height: Math.round(clamp(p.output?.height, 16, 8192, 2048)),
    },
    layers: p.layers.map(normalizeLayer).filter((l): l is LayerInstance => l !== null),
    audio: {
      routes: (p.audio?.routes ?? [])
        .filter((r) => r && typeof r.target === "string" && AUDIO_BANDS.includes(r.band))
        .map((r) => ({ id: r.id ?? `route-${Math.random().toString(36).slice(2, 7)}`, band: r.band, target: r.target, amount: clamp(r.amount, -1, 1, 0.5) })),
    },
  };
  return doc;
}

export function layerToPresetLayer(l: LayerInstance): PresetLayer {
  return {
    id: l.id,
    generator: l.generator,
    name: l.name,
    enabled: l.enabled,
    blend: l.blend,
    opacity: l.opacity,
    clip: l.clip,
    region: { ...l.region },
    regionX: { ...l.regionX },
    timeShift: { ...l.timeShift },
    params: { ...l.params },
  };
}

/** Document → preset data (for saving user presets). */
export function documentToPreset(doc: FacadeDocument, meta: Pick<PresetDef, "id" | "name" | "category"> & Partial<PresetDef>): PresetDef {
  return {
    schema: 1,
    ...meta,
    seed: doc.seed,
    architecture: { ...doc.architecture },
    animation: { ...doc.animation },
    look: { ...doc.look },
    output: { ...doc.output },
    layers: doc.layers.map(layerToPresetLayer),
    audio: { routes: doc.audio.routes.map((r) => ({ ...r })) },
  };
}
