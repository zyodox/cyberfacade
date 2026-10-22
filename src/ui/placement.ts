/**
 * Placement rectangles of placed facade elements (image / video / sign
 * layers) in texture space, for the 2D drag handles.
 */
import { assetMeta } from "../assets/assets";
import { textMetrics, TEXT_PAD } from "../assets/textRaster";
import { signTextSpec } from "../procedural/generators/sign";
import type { LayerInstance } from "../procedural/types";

/**
 * Text box size in em units (width, height) — the widest message plus a thin
 * margin, from the same layout the GPU atlas uses. Tickers span their window.
 */
export function textBoxEm(layer: LayerInstance): [number, number] | null {
  const spec = signTextSpec(layer);
  if (!spec) return null;
  const m = textMetrics(spec);
  const p = layer.params;
  const w = p.anim === "scroll" && (p.tickerWidth as number) > 0 ? (p.tickerWidth as number) / Math.max(1e-4, p.size as number) - 2 * (TEXT_PAD - 0.2) : m.w + 0.4;
  return [Math.max(0.2, w), Math.max(0.2, m.h + 0.4)];
}

/** Full text raster box (incl. glow padding) in em — the extent of the sign's own texture. */
export function textRasterEm(layer: LayerInstance): [number, number] | null {
  const em = textBoxEm(layer);
  if (!em) return null;
  const inset = 2 * (TEXT_PAD - 0.2);
  return [em[0] + inset, em[1] + inset];
}

export interface PlacementRect {
  /** Centre and size in building space (x right, y up, 0..1). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Aspect-locked (contain-fit media, text). */
  uniform: boolean;
}

/**
 * Placement rectangle of a media / sign layer. `aspect` = texture width / height.
 * `bays` / `floors` are needed for media snapped to the grid.
 */
export function layerRect(layer: LayerInstance, aspect: number, grid?: { bays: number; floors: number }): PlacementRect | null {
  const p = layer.params;
  if (layer.generator === "media") {
    const fromBelow = p.source === "below";
    const meta = !fromBelow && p.file ? assetMeta(p.file as string) : undefined;
    const contain = p.fit === "contain" && !fromBelow;
    let h = p.sizeH as number;
    if (contain) {
      if (!meta?.width || !meta.height) return null;
      h = (p.sizeW as number) * aspect * (meta.height / meta.width);
    }
    let cx = p.posX as number;
    let cy = p.posY as number;
    let w = p.sizeW as number;
    if (p.snap && grid) {
      const snap = (lo: number, size: number, n: number) => {
        const a = Math.round(lo * n) / n;
        const b = Math.max(Math.round((lo + size) * n), Math.round(lo * n) + 1) / n;
        return [a, b];
      };
      const [x0, x1] = snap(cx - w / 2, w, grid.bays);
      const [y0, y1] = snap(cy - h / 2, h, grid.floors);
      cx = (x0 + x1) / 2;
      cy = (y0 + y1) / 2;
      w = x1 - x0;
      h = y1 - y0;
    }
    return { cx, cy, w, h, uniform: contain };
  }
  if (layer.generator === "sign") {
    const em = textBoxEm(layer);
    if (!em) return null;
    const s = p.size as number;
    return { cx: p.posX as number, cy: p.posY as number, w: em[0] * s, h: em[1] * s * aspect, uniform: true };
  }
  return null;
}

/** Rect of the sign's whole texture (letters + glow padding). */
export function signRasterRect(layer: LayerInstance, aspect: number): PlacementRect | null {
  const em = textRasterEm(layer);
  if (!em) return null;
  const s = layer.params.size as number;
  return { cx: layer.params.posX as number, cy: layer.params.posY as number, w: em[0] * s, h: em[1] * s * aspect, uniform: true };
}
