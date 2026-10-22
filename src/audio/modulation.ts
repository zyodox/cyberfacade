/**
 * Applies audio routes to a document by producing a lightly patched copy
 * (only the touched layers/params are cloned). Runs on the CPU before frame
 * compilation — shaders stay audio-agnostic.
 */
import { getGenerator } from "../procedural/registry";
import type { AudioBand, FacadeDocument, LayerInstance } from "../procedural/types";

export type Bands = Record<AudioBand, number>;

export const SILENT: Bands = { bass: 0, mid: 0, high: 0, level: 0 };

export function applyAudio(doc: FacadeDocument, bands: Bands): FacadeDocument {
  const routes = doc.audio.routes;
  if (!routes.length) return doc;
  let look = doc.look;
  const layers = new Map<string, LayerInstance>();
  const layerOf = (id: string) => {
    let l = layers.get(id);
    if (!l) {
      const src = doc.layers.find((x) => x.id === id);
      if (!src) return null;
      l = { ...src, params: { ...src.params } };
      layers.set(id, l);
    }
    return l;
  };

  for (const r of routes) {
    const v = bands[r.band] ?? 0;
    if (r.target === "look.emission") {
      look = { ...look, emission: Math.max(0, look.emission * (1 + r.amount * v * 3)) };
      continue;
    }
    const dot = r.target.indexOf(".");
    if (dot < 0) continue;
    const layer = layerOf(r.target.slice(0, dot));
    if (!layer) continue;
    const key = r.target.slice(dot + 1);
    if (key === "opacity") {
      layer.opacity = Math.min(1, Math.max(0, layer.opacity + r.amount * v));
      continue;
    }
    const def = getGenerator(layer.generator)?.params.find((p) => p.key === key);
    if (!def || (def.type !== "float" && def.type !== "int")) continue;
    const base = layer.params[key] as number;
    const next = base + r.amount * v * (def.max - def.min);
    layer.params[key] = Math.min(def.max, Math.max(def.min, def.type === "int" ? Math.round(next) : next));
  }
  return { ...doc, look, layers: doc.layers.map((l) => layers.get(l.id) ?? l) };
}

/** Numeric targets a route can drive, for the UI. */
export function routeTargets(doc: FacadeDocument): { id: string; label: string; group: string }[] {
  const out = [{ id: "look.emission", label: "Global emission", group: "Look" }];
  for (const l of doc.layers) {
    const def = getGenerator(l.generator);
    if (!def) continue;
    out.push({ id: `${l.id}.opacity`, label: "Opacity", group: l.name });
    for (const p of def.params) if (p.type === "float" || p.type === "int") out.push({ id: `${l.id}.${p.key}`, label: p.label, group: l.name });
  }
  return out;
}
