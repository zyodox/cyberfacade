/**
 * Logo → two textures for the Vector Logo layer:
 *
 *   colour  the logo as drawn (SVG rendered crisp, or the raster image), padded
 *   data    two copies side by side (same padding each), GAP apart so mip levels do not mix:
 *             left   R = stroke coverage (a tube along every outline / path),
 *                    G, B = draw order along all strokes (16-bit, hi / lo)
 *             right  R = draw order along the stroke's own path (0..1),
 *                    G = path id (random per path), B = 1 + draw order (8-bit; 0 = no stroke),
 *                    all spread wide around each stroke so the glow knows its stroke
 *
 * SVG paths are walked with getPointAtLength, so the neon draws on exactly in
 * the order the logo was drawn. Raster images get their alpha edge as the
 * tube and a radial sweep as the draw order.
 */

/** Padding around the logo (fraction of the long side) — room for glow. */
export const LOGO_PAD = 0.16;
/** Empty columns between the two halves of the data map (keeps glow mips apart). */
const GAP = 512;

export function isSvg(mime: string): boolean {
  return mime === "image/svg+xml" || mime.endsWith("+xml") || mime === "image/svg";
}

interface SvgInfo {
  text: string;
  w: number;
  h: number;
}

/** SVG text with explicit pixel width / height (long side = `long`), keeping its aspect. */
export function sizedSvg(text: string, long: number): SvgInfo {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("Not an SVG document.");
  let vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const aw = parseFloat(svg.getAttribute("width") ?? "");
  const ah = parseFloat(svg.getAttribute("height") ?? "");
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
    vb = [0, 0, aw > 0 ? aw : 1024, ah > 0 ? ah : 1024];
    svg.setAttribute("viewBox", vb.join(" "));
  }
  const aspect = vb[2] / vb[3];
  const w = Math.round(aspect >= 1 ? long : long * aspect);
  const h = Math.round(aspect >= 1 ? long / aspect : long);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return { text: new XMLSerializer().serializeToString(svg), w, h };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

/** Decoded bitmap of an SVG file (long side 2048) — used by the asset library. */
export async function svgBitmap(blob: Blob, long = 2048): Promise<ImageBitmap> {
  const info = sizedSvg(await blob.text(), long);
  const url = URL.createObjectURL(new Blob([info.text], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const c = document.createElement("canvas");
    c.width = info.w;
    c.height = info.h;
    c.getContext("2d")!.drawImage(img, 0, 0, info.w, info.h);
    return await createImageBitmap(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const GEOMETRY = "path, rect, circle, ellipse, line, polyline, polygon";

export interface LogoRaster {
  color: HTMLCanvasElement;
  data: HTMLCanvasElement;
}

/** `stroke` = tube width as a fraction of the logo's long side. */
export async function rasterizeLogo(blob: Blob, mime: string, stroke: number, maxSide: number): Promise<LogoRaster> {
  const long = Math.min(1536, Math.floor((maxSide - GAP) / 2 / (1 + 2 * LOGO_PAD)));
  return isSvg(mime) ? rasterizeSvg(await blob.text(), long, stroke) : rasterizeBitmap(await createImageBitmap(blob), long, stroke);
}

function makeCanvases(w: number, h: number): { color: HTMLCanvasElement; data: HTMLCanvasElement; pad: number; W: number; H: number } {
  const pad = Math.round(Math.max(w, h) * LOGO_PAD);
  const W = w + 2 * pad;
  const H = h + 2 * pad;
  const color = document.createElement("canvas");
  color.width = W;
  color.height = H;
  const data = document.createElement("canvas");
  data.width = 2 * W + GAP;
  data.height = H;
  const dc = data.getContext("2d")!;
  dc.fillStyle = "#000";
  dc.fillRect(0, 0, data.width, H);
  return { color, data, pad, W, H };
}

async function rasterizeSvg(text: string, long: number, stroke: number): Promise<LogoRaster> {
  const info = sizedSvg(text, long);
  const { color, data, pad, W, H } = makeCanvases(info.w, info.h);

  // Colour: the SVG as authored.
  const url = URL.createObjectURL(new Blob([info.text], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    color.getContext("2d")!.drawImage(img, pad, pad, info.w, info.h);
  } finally {
    URL.revokeObjectURL(url);
  }

  // Walk every drawable path in the live DOM (lengths and transforms need layout).
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;";
  host.innerHTML = info.text;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector("svg") as SVGSVGElement;
    const root = svg.getBoundingClientRect();
    const els = Array.from(svg.querySelectorAll<SVGGeometryElement>(GEOMETRY)).filter(
      (el) => !el.closest("defs, clipPath, mask, symbol, pattern, marker") && typeof el.getTotalLength === "function",
    );
    const paths: { pts: [number, number][]; len: number; el: SVGGeometryElement; m: DOMMatrix; L: number }[] = [];
    let total = 0;
    for (const el of els) {
      let L = 0;
      try {
        L = el.getTotalLength();
      } catch {
        continue;
      }
      const m = el.getScreenCTM();
      if (!m || !(L > 0)) continue;
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      paths.push({ pts: [], len: L * scale, el, m, L });
      total += L * scale;
    }
    // ~1.5 px steps, capped at 60k samples for very long logos.
    const step = Math.max(1.5, total / 60000);
    for (const p of paths) {
      const n = Math.max(2, Math.ceil(p.len / step) + 1);
      for (let k = 0; k < n; k++) {
        const q = p.el.getPointAtLength((p.L * k) / (n - 1));
        const s = new DOMPoint(q.x, q.y).matrixTransform(p.m);
        p.pts.push([s.x - root.left + pad, s.y - root.top + pad]);
      }
    }
    drawTrace(data, W, H, paths, total, Math.max(2, stroke * long));
  } finally {
    host.remove();
  }
  return { color, data };
}

/** Strokes with their draw order: coverage (true width) and order (a little wider, so AA never mixes orders inside the tube). */
function drawTrace(data: HTMLCanvasElement, W: number, H: number, paths: { pts: [number, number][]; len: number }[], total: number, width: number): void {
  const ctx = data.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const DW = 2 * W + GAP;
  const RX = W + GAP;
  const order = document.createElement("canvas");
  order.width = DW;
  order.height = H;
  const oc = order.getContext("2d")!;
  oc.fillStyle = "#000";
  oc.fillRect(0, 0, DW, H);
  oc.lineCap = "round";
  oc.lineJoin = "round";
  oc.lineWidth = width + 3;

  // Coverage.
  ctx.strokeStyle = "#f00";
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const p of paths) {
    p.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  }
  ctx.stroke();

  // Order: one short segment per sample. Left copy: exact 16-bit global order on
  // the tube. Right copy: per-path order, path id and coarse global order (1..255,
  // 0 = no stroke) — first drawn wide (the glow halo learns the order of the
  // stroke it belongs to), then at tube width on top so tubes stay exact.
  const halo = width + 2 * Math.round(0.11 * Math.max(W, H) / (1 + 2 * LOGO_PAD));
  const segments = (step: number, draw: (x0: number, y0: number, x1: number, y1: number, tg: number, tp: number, id: number) => void) => {
    let acc = 0;
    paths.forEach((p, pi) => {
      const n = p.pts.length;
      const segLen = p.len / Math.max(1, n - 1);
      const id = (Math.imul(pi + 1, 2654435761) >>> 24) & 255;
      for (let k = 0; k + 1 < n; k += step) {
        const k1 = Math.min(n - 1, k + step);
        const [x0, y0] = p.pts[k];
        const [x1, y1] = p.pts[k1];
        draw(x0, y0, x1, y1, total > 0 ? (acc + segLen * k) / total : 0, k / Math.max(1, n - 1), id);
      }
      acc += p.len;
    });
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    oc.beginPath();
    oc.moveTo(x0, y0);
    oc.lineTo(x1, y1);
    oc.stroke();
  };
  oc.lineWidth = halo;
  segments(4, (x0, y0, x1, y1, tg, tp, id) => {
    oc.strokeStyle = `rgb(${Math.round(tp * 255)},${id},${1 + Math.round(tg * 254)})`;
    seg(x0 + RX, y0, x1 + RX, y1);
  });
  oc.lineWidth = width + 3;
  segments(1, (x0, y0, x1, y1, tg, tp, id) => {
    const q = Math.round(tg * 65535);
    oc.strokeStyle = `rgb(0,${q >> 8},${q & 255})`;
    seg(x0, y0, x1, y1);
    oc.strokeStyle = `rgb(${Math.round(tp * 255)},${id},${1 + Math.round(tg * 254)})`;
    seg(x0 + RX, y0, x1 + RX, y1);
  });

  // Merge: coverage R from the true-width pass, everything else from the order pass.
  const a = ctx.getImageData(0, 0, DW, H);
  const b = oc.getImageData(0, 0, DW, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < DW; x++) {
      const i = (y * DW + x) * 4;
      if (x < W) {
        a.data[i + 1] = b.data[i + 1];
        a.data[i + 2] = b.data[i + 2];
      } else {
        a.data[i] = b.data[i];
        a.data[i + 1] = b.data[i + 1];
        a.data[i + 2] = b.data[i + 2];
      }
      a.data[i + 3] = 255;
    }
  }
  ctx.putImageData(a, 0, 0);
}

/** Raster logos: the alpha edge becomes the tube, a radial sweep around the centre the draw order. */
function rasterizeBitmap(bmp: ImageBitmap, long: number, stroke: number): LogoRaster {
  const s = Math.min(1, long / Math.max(bmp.width, bmp.height));
  const w = Math.max(8, Math.round(bmp.width * s));
  const h = Math.max(8, Math.round(bmp.height * s));
  const { color, data, pad, W, H } = makeCanvases(w, h);
  const cc = color.getContext("2d", { willReadFrequently: true })!;
  cc.drawImage(bmp, pad, pad, w, h);
  const px = cc.getImageData(0, 0, W, H).data;

  // Mask: alpha, or luminance for opaque images (logo on black).
  let opaque = true;
  for (let i = 3; i < px.length; i += 16) if (px[i] < 250) (opaque = false);
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const v = opaque ? Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) : px[i * 4 + 3];
    mask[i] = v > 110 ? 1 : 0;
  }
  // Edge band = dilate(mask) − erode(mask), half-width r.
  const r = Math.max(1, Math.round((stroke * long) / 2));
  const dil = morph(mask, W, H, r, true);
  const ero = morph(mask, W, H, r, false);
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[y * W + x]) {
        cx += x;
        cy += y;
        n++;
      }
  cx = n ? cx / n : W / 2;
  cy = n ? cy / n : H / 2;
  const dc = data.getContext("2d")!;
  const img = dc.getImageData(0, 0, 2 * W + GAP, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const edge = dil[k] && !ero[k];
      // Sweep clockwise from 12 o'clock.
      const t = (Math.atan2(x - cx, -(y - cy)) / (2 * Math.PI) + 1) % 1;
      const q = Math.round(t * 65535);
      const iL = (y * (2 * W + GAP) + x) * 4;
      const iR = iL + (W + GAP) * 4;
      img.data[iL] = edge ? 255 : 0;
      img.data[iL + 1] = q >> 8;
      img.data[iL + 2] = q & 255;
      img.data[iR] = Math.round(t * 255);
      img.data[iR + 1] = 0;
      img.data[iR + 2] = 1 + Math.round(t * 254);
      img.data[iL + 3] = img.data[iR + 3] = 255;
    }
  }
  dc.putImageData(img, 0, 0);
  if (opaque) {
    // Opaque artwork: black becomes transparent so the facade shows around the logo.
    const ci = cc.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) ci.data[i * 4 + 3] = Math.min(255, Math.max(ci.data[i * 4], ci.data[i * 4 + 1], ci.data[i * 4 + 2]) * 1.4);
    cc.putImageData(ci, 0, 0);
  }
  return { color, data };
}

/** Separable square max (dilate) / min (erode) of radius r. */
function morph(src: Uint8Array, W: number, H: number, r: number, dilate: boolean): Uint8Array {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  const pick = dilate ? 1 : 0;
  for (let y = 0; y < H; y++) {
    let count = 0;
    const row = y * W;
    for (let x = -r; x < W; x++) {
      const add = x + r;
      if (add < W && src[row + add] === pick) count++;
      const rem = x - r - 1;
      if (rem >= 0 && src[row + rem] === pick) count--;
      if (x >= 0) tmp[row + x] = dilate ? (count > 0 ? 1 : 0) : count > 0 ? 0 : 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let count = 0;
    for (let y = -r; y < H; y++) {
      const add = y + r;
      if (add < H && tmp[add * W + x] === pick) count++;
      const rem = y - r - 1;
      if (rem >= 0 && tmp[rem * W + x] === pick) count--;
      if (y >= 0) out[y * W + x] = dilate ? (count > 0 ? 1 : 0) : count > 0 ? 0 : 1;
    }
  }
  return out;
}
