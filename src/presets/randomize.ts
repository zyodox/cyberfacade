import { clampParam, hexToRgb, rgbToHex, type ParamDef, type ParamValue } from "../procedural/params";
import { getGenerator } from "../procedural/registry";
import type { FacadeDocument } from "../procedural/types";
import { mulberry32 } from "./random";
import type { PresetDef } from "./types";

export type LockSet = Record<string, boolean>;

export const lockPath = {
  seed: "seed",
  arch: (key: string) => `arch.${key}`,
  param: (layerId: string, key: string) => `${layerId}.${key}`,
};

function rgbToHsv([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb([h, s, v]: [number, number, number]): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/** Jitter around `base` by the parameter's random amount (× `mult`). */
export function jitterParam(def: ParamDef, base: ParamValue, rng: () => number, range?: [number, number], mult = 1): ParamValue {
  if (range && (def.type === "float" || def.type === "int")) {
    return clampParam(def, range[0] + rng() * (range[1] - range[0]));
  }
  const amount = (typeof def.random === "number" ? def.random : def.random === false ? 0 : 0.1) * mult;
  if (amount <= 0) return base;
  switch (def.type) {
    case "float":
    case "int":
      return clampParam(def, (base as number) + (rng() * 2 - 1) * amount * (def.max - def.min));
    case "color": {
      const [h, s, v] = rgbToHsv(hexToRgb(base as string));
      const nh = (h + (rng() * 2 - 1) * amount + 1) % 1;
      const ns = Math.min(1, Math.max(0, s + (rng() * 2 - 1) * amount * 1.5));
      return rgbToHex(hsvToRgb([nh, ns, v]));
    }
    default:
      return base;
  }
}

/**
 * RANDOMIZE: new seed plus parameter jitter *around the preset's own values*
 * (not the current ones), so repeated presses never drift away from the
 * preset's identity. Locked parameters are untouched. Deterministic in `rngSeed`.
 */
export function randomizeDocument(doc: FacadeDocument, base: FacadeDocument, preset: PresetDef | null, locks: LockSet, rngSeed: number): FacadeDocument {
  const rng = mulberry32(rngSeed);
  const ranges = preset?.randomize ?? {};
  const next: FacadeDocument = structuredClone(doc);

  if (!locks[lockPath.seed]) next.seed = Math.floor(rng() * 2 ** 31);

  const arch = next.architecture;
  const bArch = base.architecture;
  const archJitter = (key: "floors" | "bays", amount: number, lo: number, hi: number) => {
    if (locks[lockPath.arch(key)]) return;
    const r = ranges[`arch.${key}`];
    const v = r ? r[0] + rng() * (r[1] - r[0]) : bArch[key] * (1 + (rng() * 2 - 1) * amount);
    arch[key] = Math.min(hi, Math.max(lo, Math.round(v)));
  };
  archJitter("floors", 0.15, 1, 400);
  archJitter("bays", 0.12, 1, 200);

  for (const layer of next.layers) {
    const def = getGenerator(layer.generator);
    const baseLayer = base.layers.find((l) => l.id === layer.id);
    if (!def || !baseLayer) continue;
    for (const p of def.params) {
      if (locks[lockPath.param(layer.id, p.key)]) continue;
      layer.params[p.key] = jitterParam(p, baseLayer.params[p.key], rng, ranges[`${layer.id}.${p.key}`]);
    }
  }
  return next;
}
