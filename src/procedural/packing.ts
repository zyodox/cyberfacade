/**
 * Binary layout shared by every render backend. WGSL mirrors this in
 * `shaders/common.wgsl` (Globals) and in the generated `Params` struct.
 */
import { clampParam, packParam } from "./params";
import { BLEND_MODES, SYMMETRY_MODES, type FacadeDocument, type GeneratorDef, type LayerInstance } from "./types";

export const GLOBALS_FLOATS = 20;
/**
 * Four vec4 slots of per-layer common data precede the generator parameters:
 * base0 (opacity, blend, salt, clip), base1 (height region), base2 (horizontal
 * region), base3 (time displacement y, x, quantize).
 */
export const LAYER_BASE_SLOTS = 4;

export interface FrameTime {
  /** Normalized loop phase in [0, 1). */
  phase: number;
  /** Absolute seconds (for display/debug only; shaders must use `phase`). */
  seconds: number;
}

/**
 * `width` / `height` are the resolution generators see; for a windowed render
 * (a detail of the facade) that is the full virtual size and `uvOffset` the
 * UV of the target's top-left corner.
 */
export function packGlobals(doc: FacadeDocument, width: number, height: number, time: FrameTime, out = new ArrayBuffer(GLOBALS_FLOATS * 4), uvOffset: [number, number] = [0, 0]): ArrayBuffer {
  const f = new Float32Array(out);
  const u = new Uint32Array(out);
  const a = doc.architecture;
  const sym = SYMMETRY_MODES.indexOf(a.symmetry);
  f[0] = width;
  f[1] = height;
  f[2] = time.phase;
  f[3] = doc.animation.duration;
  f[4] = Math.max(1, Math.round(a.floors));
  f[5] = Math.max(1, Math.round(a.bays));
  f[6] = Math.max(1, Math.round(a.facades));
  f[7] = a.slab;
  f[8] = a.mullion;
  // bit 0 = mirror inside each facade, bit 1 = all facades identical
  f[9] = sym === 1 ? 1 : sym === 2 ? 2 : sym === 3 ? 3 : 0;
  u[10] = doc.seed >>> 0;
  f[11] = doc.animation.speed;
  f[12] = doc.look.emission;
  f[13] = time.seconds;
  f[14] = uvOffset[0];
  f[15] = uvOffset[1];
  // Wrap start / period / reference width, in widths of this texture (the texture's own U wrap).
  f[16] = 0;
  f[17] = 1;
  f[18] = 1;
  f[19] = 0;
  return out;
}

/** Stable 24-bit salt from a layer id so duplicate generators decorrelate. */
export function layerSalt(id: string): number {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) {
    h ^= id.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) & 0xffffff;
}

export function layerUniformFloats(def: GeneratorDef): number {
  return (LAYER_BASE_SLOTS + def.params.length + (def.dynamic?.slots ?? 0)) * 4;
}

export function packLayer(layer: LayerInstance, def: GeneratorDef, out?: Float32Array): Float32Array {
  const buf = out ?? new Float32Array(layerUniformFloats(def));
  buf[0] = layer.opacity;
  buf[1] = Math.max(0, BLEND_MODES.indexOf(layer.blend));
  buf[2] = layerSalt(layer.id);
  buf[3] = layer.clip ? 1 : 0;
  buf[4] = layer.region.min;
  buf[5] = layer.region.max;
  buf[6] = layer.region.soft;
  buf[7] = layer.region.invert ? 1 : 0;
  buf[8] = layer.regionX.min;
  buf[9] = layer.regionX.max;
  buf[10] = layer.regionX.soft;
  buf[11] = 0;
  buf[12] = layer.timeShift.y;
  buf[13] = layer.timeShift.x;
  buf[14] = layer.timeShift.quantize ? 1 : 0;
  buf[15] = 0;
  if (def.extra) [buf[11], buf[15]] = def.extra(layer);
  def.params.forEach((p, k) => {
    const o = (LAYER_BASE_SLOTS + k) * 4;
    buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0;
    packParam(p, clampParam(p, layer.params[p.key]), buf, o);
  });
  return buf;
}
