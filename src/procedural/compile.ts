import type { FrameDescription, LayerPass } from "../renderer/types";
import { GLOBALS_FLOATS, layerUniformFloats, packGlobals, packLayer, type FrameTime } from "./packing";
import { getGenerator } from "./registry";
import type { FacadeDocument } from "./types";

export interface CompileOptions {
  /** Stop after this layer (inspect intermediate results of the stack). */
  upTo?: string | null;
  /**
   * Render only a window of the facade (u0, v0, u1, v1 in UV, v down) at the
   * requested size — a sharp close-up of one area of the facade.
   */
  window?: [number, number, number, number];
}

/**
 * Compiles a document into a backend-agnostic frame description.
 * Reuses typed arrays between calls, so per-frame compilation is allocation-free
 * once warm.
 */
export class FrameCompiler {
  private globals = new ArrayBuffer(GLOBALS_FLOATS * 4);
  private layerBuffers = new Map<string, Float32Array>();

  /** `upTo` stops after that layer (inspect intermediate results of the stack). */
  compile(doc: FacadeDocument, width: number, height: number, time: FrameTime, upTo?: string | null, opts: CompileOptions = {}): FrameDescription {
    const win = opts.window;
    if (win) {
      const du = Math.max(1e-4, win[2] - win[0]);
      const dv = Math.max(1e-4, win[3] - win[1]);
      packGlobals(doc, width / du, height / dv, time, this.globals, [win[0], win[1]]);
    } else packGlobals(doc, width, height, time, this.globals);
    const layers: LayerPass[] = [];
    const live = new Set<string>();
    const stop = upTo ? doc.layers.findIndex((l) => l.id === upTo) : -1;
    const source = stop >= 0 ? doc.layers.slice(0, stop + 1) : doc.layers;
    for (const layer of source) {
      if (!layer.enabled || layer.opacity <= 0) continue;
      const def = getGenerator(layer.generator);
      if (!def) continue;
      const key = `${layer.id}:${def.id}`;
      live.add(key);
      let buf = this.layerBuffers.get(key);
      if (!buf || buf.length !== layerUniformFloats(def)) {
        buf = new Float32Array(layerUniformFloats(def));
        this.layerBuffers.set(key, buf);
      }
      packLayer(layer, def, buf);
      const mctx = { phase: time.phase, duration: doc.animation.duration, speed: doc.animation.speed };
      if (def.dynamic) {
        const o = buf.length - def.dynamic.slots * 4;
        buf.fill(0, o);
        def.dynamic.fill(layer, mctx, buf, o);
      }
      const media = def.media?.(layer, mctx) ?? undefined;
      layers.push({ key, generator: def.id, uniforms: buf, media, particles: def.particles?.(layer) });
    }
    for (const key of this.layerBuffers.keys()) if (!live.has(key)) this.layerBuffers.delete(key);
    return { width, height, globals: this.globals, layers };
  }
}

/** One-shot compile (thumbnails, export). */
export function compileFrame(doc: FacadeDocument, width: number, height: number, time: FrameTime, upTo?: string | null, opts: CompileOptions = {}): FrameDescription {
  const frame = new FrameCompiler().compile(doc, width, height, time, upTo, opts);
  return { ...frame, globals: frame.globals.slice(0) };
}
