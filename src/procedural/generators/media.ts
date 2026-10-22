import { assetMeta } from "../../assets/assets";
import { asset, b, c, e, f, i } from "../params";
import type { GeneratorDef, LayerInstance, MediaContext, MediaRef, SingleMediaRef } from "../types";

/** Video frame time for a loop phase. "fit" keeps loops seamless by playing a whole number of clip repeats per loop. */
export function videoTime(layer: LayerInstance, clipSeconds: number, ctx: MediaContext): { time: number; rate: number } {
  const p = layer.params;
  const D = clipSeconds > 0 ? clipSeconds : 1;
  const L = Math.max(0.1, ctx.duration);
  const V = (p.videoSpeed as number) ?? 1;
  const O = (p.videoOffset as number) ?? 0;
  const fract = (x: number) => x - Math.floor(x);
  switch (p.timing) {
    case "stretch":
      return { time: fract(ctx.phase + O) * D, rate: D / L };
    case "free": {
      const t = ctx.phase * L * ctx.speed * V + O * D;
      return { time: t - Math.floor(t / D) * D, rate: ctx.speed * V };
    }
    default: {
      const n = Math.max(1, Math.round((L * ctx.speed * V) / D));
      return { time: fract(ctx.phase * n + O) * D, rate: (n * D) / L };
    }
  }
}

const ITEM_KEYS = ["file", "file2", "file3", "file4", "file5", "file6"];

interface Entry {
  id: string;
  /** Slot number 1–6 (keys of its own time / transition settings). */
  k: number;
}

function playlistEntries(layer: LayerInstance): Entry[] {
  return ITEM_KEYS.map((key, i) => ({ id: String(layer.params[key] ?? ""), k: i + 1 })).filter((e) => e.id);
}

/** The layer's playlist (imported files in order, empty slots skipped). */
export function playlistItems(layer: LayerInstance): string[] {
  return playlistEntries(layer).map((e) => e.id);
}

export const PLAYLIST_TRANSITIONS: [string, string][] = [
  ["cut", "Cut"],
  ["fade", "Cross-fade"],
  ["glitch", "Glitch"],
  ["push", "Push left"],
  ["slide", "Slide up"],
  ["wipe", "Wipe (light edge)"],
  ["trivision", "Tri-vision slats"],
  ["pixel", "Pixelate"],
  ["dissolve", "Block dissolve"],
  ["datamosh", "Datamosh"],
  ["zoom", "Zoom through"],
  ["flash", "Flash"],
  ["iris", "Iris"],
  ["scan", "Scan build"],
];

interface SeqState {
  n: number;
  /** Slot index within the loop, item shown, item coming in. */
  slot: number;
  a: number;
  b: number;
  /** Transition progress (−1 = none). */
  p: number;
  /** Seconds since item a / b appeared. */
  ageA: number;
  ageB: number;
  /** Transition override for this slot: index + 1, 0 = layer default. */
  tr: number;
}

const TR_IDS = PLAYLIST_TRANSITIONS.map(([id]) => id);

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Play order as indices into the entries: forward, ping-pong or a fixed shuffle. */
function playOrder(layer: LayerInstance, n: number): number[] {
  const fwd = Array.from({ length: n }, (_, i) => i);
  switch (layer.params.order) {
    case "reverse":
      return fwd.reverse();
    case "pingpong":
      return n > 2 ? [...fwd, ...fwd.slice(1, -1).reverse()] : fwd;
    case "shuffle": {
      let h = hashStr(`${layer.id}:${layer.params.shuffleSeed ?? 0}`) || 1;
      const a = [...fwd];
      for (let i = n - 1; i > 0; i--) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
        h = (h ^ (h >>> 13)) >>> 0;
        const j = h % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    default:
      return fwd;
  }
}

/**
 * Where the playlist is at a loop phase. Each item has its own screen time and
 * outgoing transition; the whole sequence is scaled so it repeats a whole
 * number of times per loop (seamless).
 */
export function playlistState(layer: LayerInstance, ctx: MediaContext): SeqState {
  const entries = playlistEntries(layer);
  const n = entries.length;
  const D = Math.max(0.1, ctx.duration);
  if (n <= 1) return { n, slot: 0, a: 0, b: 0, p: -1, ageA: ctx.phase * D, ageB: 0, tr: 0 };
  const p = layer.params;
  const seq = playOrder(layer, n);
  const m = seq.length;
  const base = Math.max(0.05, p.hold as number);
  const holdOf = (i: number) => {
    const h = Number(p[`hold${entries[i].k}`] ?? 0);
    return h > 0 ? h : base;
  };
  const transOf = (i: number) => {
    const t = String(p[`trans${entries[i].k}`] ?? "default");
    return t === "default" ? String(p.transition) : t;
  };
  const d = seq.map(holdOf);
  const C = d.reduce((x, y) => x + y, 0);
  const per = Math.max(1, Math.round((D * ctx.speed) / C));
  const k = D / (per * C); // real seconds per nominal second
  const tAll = (ctx.phase * per - Math.floor(ctx.phase * per)) * C;
  const cyc = Math.floor(ctx.phase * per);
  let j = 0;
  let start = 0;
  while (j < m - 1 && tAll >= start + d[j]) start += d[j++];
  const u = (tAll - start) / d[j];
  const tauOf = (jj: number) => {
    const tr = transOf(seq[jj]);
    return tr === "cut" ? 0 : Math.min(0.95, Math.max(0.02, (p.transTime as number) / d[jj]));
  };
  const tau = tauOf(j);
  const prev = (j + m - 1) % m;
  const tr = transOf(seq[j]);
  return {
    n,
    slot: cyc * m + j,
    a: seq[j],
    b: seq[(j + 1) % m],
    p: tau > 0 && u > 1 - tau ? (u - (1 - tau)) / tau : -1,
    ageA: ((tAll - start) + tauOf(prev) * d[prev]) * k,
    ageB: Math.max(0, u - (1 - tau)) * d[j] * k,
    tr: TR_IDS.indexOf(tr) + 1,
  };
}

function itemRef(id: string, age: number, layer: LayerInstance, tag: string): SingleMediaRef {
  if (id[0] !== "v") return { kind: "image", assetId: id };
  const p = layer.params;
  const clip = Math.max(0.05, assetMeta(id)?.duration ?? 1);
  const V = (p.videoSpeed as number) ?? 1;
  let t = age * V;
  const fps = p.frameRate as number;
  if (fps > 0) t = Math.floor(t * fps) / fps;
  t = t - Math.floor(t / clip) * clip;
  return { kind: "video", assetId: id, time: t, rate: fps > 0 ? 0 : V, tag };
}

/**
 * Image / Video: an imported photo or clip — or a playlist of up to six that
 * cut, glitch, slide or flip (tri-vision) from one to the next, like the ad
 * loops on real media facades — placed on the facade as a billboard, LED
 * screen, window-pixel media facade or hologram. Keying turns a green-screen
 * or black-background clip into a free-standing figure.
 */
export const mediaGenerator: GeneratorDef = {
  id: "media",
  label: "Image / Video",
  kind: "generator",
  description: "Imported photos / videos as a billboard, ad playlist, LED screen, window pixels or hologram.",
  defaultBlend: "normal",
  params: [
    asset("file", "File", ["image", "video"], { group: "Source" }),
    e("source", "Show", "file", [
      ["file", "Imported file(s)"],
      ["below", "Layers below (in place)"],
    ], { group: "Source" }),

    asset("file2", "Item 2", ["image", "video"], { group: "Playlist" }),
    asset("file3", "Item 3", ["image", "video"], { group: "Playlist" }),
    asset("file4", "Item 4", ["image", "video"], { group: "Playlist" }),
    asset("file5", "Item 5", ["image", "video"], { group: "Playlist" }),
    asset("file6", "Item 6", ["image", "video"], { group: "Playlist" }),
    f("hold", "Item time", 2.5, 0.2, 30, { group: "Playlist", unit: "s", hint: "Rounded so every item shows a whole number of times per loop", random: 0.1 }),
    e("transition", "Transition", "glitch", PLAYLIST_TRANSITIONS, { group: "Playlist" }),
    f("transTime", "Transition time", 0.5, 0.05, 4, { group: "Playlist", unit: "s", random: 0.1 }),
    i("slats", "Tri-vision slats", 18, 2, 96, { group: "Playlist", random: false }),
    c("edgeColor", "Wipe / scan edge", "#ffffff", { group: "Playlist", random: 0.03 }),
    e("easing", "Transition easing", "smooth", [
      ["smooth", "Smooth"],
      ["linear", "Linear"],
      ["snappy", "Snappy (fast middle)"],
      ["out", "Fast start, soft stop"],
      ["in", "Soft start, fast end"],
    ], { group: "Playlist" }),
    e("order", "Play order", "forward", [
      ["forward", "In order"],
      ["reverse", "Reverse"],
      ["pingpong", "Back and forth"],
      ["shuffle", "Shuffled"],
    ], { group: "Playlist" }),
    i("shuffleSeed", "Shuffle seed", 0, 0, 99, { group: "Playlist", random: false }),
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
      f(`hold${n}`, `Item ${n} time`, 0, 0, 30, { group: "Per item", unit: "s", hint: "0 = use Item time", random: false }),
      e(`trans${n}`, `Item ${n} → next`, "default", [["default", "Layer transition"], ...PLAYLIST_TRANSITIONS], { group: "Per item" }),
    ]),

    e("fit", "Fit", "contain", [
      ["contain", "Keep proportions"],
      ["cover", "Fill frame (crop)"],
      ["stretch", "Stretch to frame"],
      ["tile", "Tile across frame"],
    ], { group: "Placement" }),
    f("posX", "Centre X", 0.5, -0.5, 1.5, { group: "Placement", random: false }),
    f("posY", "Centre Y", 0.5, -0.5, 1.5, { group: "Placement", random: false, hint: "0 = bottom, 1 = top" }),
    f("sizeW", "Width", 0.6, 0.005, 2, { group: "Placement", random: false }),
    f("sizeH", "Height", 0.3, 0.005, 2, { group: "Placement", random: false, hint: "Used by Fill / Stretch / Tile" }),
    b("snap", "Snap to bays & floors", false, { group: "Placement" }),
    f("scroll", "Scroll", 0, -8, 8, { group: "Placement", step: 1, unit: "/loop", hint: "Slides the picture through its frame; whole numbers loop seamlessly", random: false }),
    e("scrollDir", "Scroll direction", "horizontal", [
      ["horizontal", "Horizontal"],
      ["vertical", "Vertical"],
    ], { group: "Placement" }),

    e("display", "Display", "direct", [
      ["direct", "Direct (billboard)"],
      ["led", "LED dots"],
      ["lines", "LED lines"],
      ["windows", "Window pixels"],
      ["hologram", "Hologram"],
    ], { group: "Display" }),
    f("pitch", "LED pitch", 5, 1.5, 60, { group: "Display", unit: "px@1k", random: 0.05 }),
    f("dotSize", "Dot size", 0.62, 0.05, 1, { group: "Display", random: 0.05 }),
    e("dotShape", "Dot shape", "round", [
      ["round", "Round"],
      ["square", "Square"],
    ], { group: "Display" }),
    f("offLevel", "Unlit dots", 0, 0, 0.2, { group: "Display", hint: "Faint glow of dark diodes", random: false }),

    e("key", "Key out", "none", [
      ["none", "Nothing"],
      ["black", "Black background (luma)"],
      ["green", "Green screen"],
      ["blue", "Blue screen"],
      ["color", "Custom colour"],
    ], { group: "Keying" }),
    c("keyColor", "Key colour", "#00ff00", { group: "Keying", random: false }),
    f("keyThreshold", "Threshold", 0.18, 0, 1, { group: "Keying", random: false }),
    f("keySoft", "Softness", 0.12, 0.001, 1, { group: "Keying", random: false }),
    f("spill", "Spill removal", 0.7, 0, 1, { group: "Keying", random: false }),

    f("intensity", "Brightness", 1.6, 0, 20, { group: "Colour", random: 0.05 }),
    f("contrast", "Contrast", 1.1, 0.2, 3, { group: "Colour", random: 0.05 }),
    f("saturation", "Saturation", 1, 0, 2, { group: "Colour", random: 0.05 }),
    f("blackCut", "Black cut", 0.03, 0, 0.5, { group: "Colour", hint: "Crushes dark pixels to true black (no grey panels)", random: false }),
    e("colorMode", "Colour mode", "original", [
      ["original", "Original"],
      ["mono", "Monochrome tint"],
      ["duotone", "Duotone"],
    ], { group: "Colour" }),
    c("tint", "Tint / highlight", "#bfe3ff", { group: "Colour", random: 0.03 }),
    c("shadow", "Duotone shadow", "#030408", { group: "Colour", random: false }),
    f("hue", "Hue shift", 0, -0.5, 0.5, { group: "Colour", random: false }),

    f("scanlines", "Scanlines", 0.5, 0, 1, { group: "Hologram", random: 0.1 }),
    f("scanDensity", "Scanline density", 260, 20, 1200, { group: "Hologram", unit: "lines", random: false }),
    f("flicker", "Flicker", 0.3, 0, 1, { group: "Hologram", random: 0.1 }),
    f("glitch", "Glitch", 0.2, 0, 1, { group: "Hologram", random: 0.1 }),
    f("glitchRate", "Glitch rate", 0.5, 0.05, 4, { group: "Hologram", unit: "Hz", random: 0.1 }),
    f("chroma", "Colour split", 3, 0, 30, { group: "Hologram", unit: "px@1k", random: 0.1 }),
    f("rim", "Edge glow", 0, 0, 4, { group: "Hologram", hint: "Bright rim around keyed figures (hologram people)", random: 0.1 }),

    f("backing", "Backing panel", 1, 0, 1, { group: "Frame", hint: "Opaque black panel behind the picture; 0 = picture only (light added)", random: false }),
    f("bezel", "Frame light", 0, 0, 6, { group: "Frame", random: 0.05 }),
    c("bezelColor", "Frame colour", "#ffffff", { group: "Frame", random: 0.03 }),
    f("bezelWidth", "Frame width", 1.5, 0.5, 16, { group: "Frame", unit: "px@1k", random: false }),

    f("videoSpeed", "Speed", 1, 0.1, 4, { group: "Video", random: false }),
    e("timing", "Loop timing", "fit", [
      ["fit", "Seamless (whole repeats)"],
      ["stretch", "Stretch clip to loop"],
      ["free", "Native speed (may jump)"],
    ], { group: "Video" }),
    f("videoOffset", "Start offset", 0, 0, 1, { group: "Video", random: false }),
    f("frameRate", "Choppy frames", 0, 0, 30, { group: "Video", unit: "fps", hint: "0 = smooth; a low rate holds frames like a cheap LED controller", random: false }),
  ],
  dynamic: {
    slots: 1,
    fill(layer, ctx, out, o) {
      const s = playlistState(layer, ctx);
      out[o] = s.p;
      out[o + 1] = s.slot;
      out[o + 2] = s.n;
      out[o + 3] = s.tr;
    },
  },
  media(layer, ctx): MediaRef | null {
    const p = layer.params;
    const items = playlistItems(layer);
    if (p.source === "below" || !items.length) return null;
    if (items.length === 1) {
      const id = items[0];
      if (id[0] === "v") {
        const vt = videoTime(layer, assetMeta(id)?.duration ?? 0, ctx);
        const fps = p.frameRate as number;
        if (fps > 0) return { kind: "video", assetId: id, time: Math.floor(vt.time * fps) / fps, rate: 0 };
        return { kind: "video", assetId: id, time: vt.time, rate: vt.rate };
      }
      return { kind: "image", assetId: id };
    }
    const s = playlistState(layer, ctx);
    const a = itemRef(items[s.a], s.ageA, layer, `i${s.a}`);
    const b = s.p >= 0 ? itemRef(items[s.b], s.ageB, layer, `i${s.b}`) : null;
    return { kind: "pair", a, b };
  },
};
