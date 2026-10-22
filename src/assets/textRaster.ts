/**
 * Text → mask atlas for sign / text-particle layers. Rasterized once per change
 * (not per frame) with Canvas2D; every visual treatment (neon tube, glow, LED
 * dots, per-letter kinetic animation, message transitions, live digits)
 * happens on the GPU.
 *
 * Atlas layout (one texture):
 *   rows 0..R-1  data stream (one 16-bit value per texel: R = high byte, G = low byte)
 *   bands        one band per message chunk, all bandW × bandH; a message wider
 *                than the texture is split into chunks (long tickers stay sharp)
 *   charset      a grid of cells with random glyphs (scramble / split-flap) and,
 *                when the text has live tokens, the digits 0–9 first
 *
 * Band channels: R = glyph fill, G = outline stroke, B = letter id (index mod 255 + 1;
 * every pixel belongs to its nearest letter cell, so glow halos animate with their letter).
 *
 * Each line of the text may start with a style tag: `{Georgia, bold, #ffcc88} Café`.
 * Tokens: a #rrggbb colour, a weight (thin…black or 100…900), anything else is a font family.
 *
 * Live tokens anywhere in the text render as animated digits:
 *   {count 0-25,000}   counts across the loop (odometer roll)
 *   {time 21:47:05}    a running clock (HH:MM or HH:MM:SS)
 *   {countdown 10:00}  counts down (SS, MM:SS or HH:MM:SS)
 *   {price 42.50 1.20} a live value wandering ± the second number
 *   {rand 6}           random digits (data readouts)
 *
 * Letters are grapheme clusters (accents, emoji). Lines in joining scripts
 * (Arabic, Hebrew, Indic, Thai…) are laid out word by word so their shaping
 * survives; right-to-left lines run right to left.
 */
import type { TextSpec } from "../procedural/types";

export const TEXT_EM = 160;
/** Padding around each message block in em (room for glow halos). */
export const TEXT_PAD = 1.25;
const MAX_SIDE = 4096;
export const MAX_LETTERS = 2000;
const MAX_MESSAGES = 32;
const MAX_TOKENS = 16;

/** Data stream layout — mirrored in common.wgsl (`txt*` helpers). */
export const TXT_HEADER = 16;
export const TXT_MSG = 8;
export const TXT_LETTER = 4;
export const TXT_TOKEN = 12;
export const TXT_VERSION = 3;
/** Letter coordinates are stored offset by this (they can be slightly negative). */
export const TXT_BIAS = 4096;

/** Random-glyph cells are 1.6 em apart so their glow has room (mirrored in txtChar). */
const charsetCell = (em: number) => Math.round(em * 1.6);

const FALLBACK = `"Yu Gothic UI", "Yu Gothic", "Meiryo", "Microsoft YaHei", "Malgun Gothic", "Segoe UI", "Segoe UI Historic", "Nirmala UI", "Leelawadee UI", sans-serif`;

const WEIGHT_WORDS: Record<string, number> = { thin: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 };

const TOKEN_RE = /\{\s*(count|counter|time|clock|countdown|timer|price|walk|rand|random)\b([^}]*)\}/gi;

export interface TextMessage {
  text: string;
  family: string;
  weight: number;
  /** sRGB 0..255, or null = the layer colour. */
  color: [number, number, number] | null;
}

function parseTag(line: string, base: TextMessage): TextMessage {
  const m = /^\s*\{([^}]*)\}\s?/.exec(line);
  if (!m || TOKEN_WORD_RE.test(m[1])) return { ...base, text: line };
  const out: TextMessage = { ...base, text: line.slice(m[0].length) };
  for (const raw of m[1].split(",")) {
    const tok = raw.trim();
    if (!tok) continue;
    if (/^#[0-9a-f]{6}$/i.test(tok)) {
      const n = parseInt(tok.slice(1), 16);
      out.color = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else if (WEIGHT_WORDS[tok.toLowerCase()]) out.weight = WEIGHT_WORDS[tok.toLowerCase()];
    else if (/^[1-9]00$/.test(tok)) out.weight = Number(tok);
    else out.family = tok.replace(/^["']|["']$/g, "");
  }
  return out;
}

const TOKEN_WORD_RE = /^\s*(count|counter|time|clock|countdown|timer|price|walk|rand|random)\b/i;

/** A line with nothing but a style tag. */
function isBlank(line: string): boolean {
  const m = /^\s*\{([^}]*)\}/.exec(line);
  const rest = m && !TOKEN_WORD_RE.test(m[1]) ? line.slice(m[0].length) : line;
  return rest.trim() === "";
}

/** The messages of a text spec: every non-empty line when `messages` is on, else the whole text. */
export function textMessages(spec: TextSpec): TextMessage[] {
  const base: TextMessage = { text: "", family: spec.family, weight: spec.weight, color: null };
  if (spec.messages) {
    const lines = spec.text.split("\n").filter((l) => !isBlank(l));
    const msgs = lines.slice(0, MAX_MESSAGES).map((l) => parseTag(l, base));
    return msgs.length ? msgs : [{ ...base, text: " " }];
  }
  const text = spec.text.length ? spec.text : " ";
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  const tagged = parseTag(first, base);
  return [{ ...tagged, text: tagged.text + (nl < 0 ? "" : text.slice(nl)) }];
}

export function hasLiveTokens(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  const r = TOKEN_RE.test(text);
  TOKEN_RE.lastIndex = 0;
  return r;
}

// ---------------------------------------------------------------------------
// Graphemes and scripts

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new (Intl as unknown as { Segmenter: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter(undefined, { granularity: "grapheme" }) : null;

export function graphemes(s: string): string[] {
  if (!segmenter) return Array.from(s);
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const JOINING_RE = /[֐-ࣿיִ-﷿ﹰ-﻿ऀ-෿฀-࿿က-႟ក-៿ꦀ-꧟]/;

interface Unit {
  text: string;
  /** Start index in the line string. */
  src: number;
}

/** Layout units of one line: graphemes, or whole words for joining / RTL scripts (visual order). */
function lineUnits(line: string): Unit[] {
  if (JOINING_RE.test(line)) {
    const out: Unit[] = [];
    const re = /\s+|\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) out.push({ text: m[0], src: m.index });
    return RTL_RE.test(line) ? out.reverse() : out;
  }
  const out: Unit[] = [];
  let i = 0;
  for (const g of graphemes(line)) {
    out.push({ text: g, src: i });
    i += g.length;
  }
  return out;
}

/** Number of visible (non-whitespace) letters of the first message. */
export function letterCount(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) n += lineUnits(line).filter((u) => u.text.trim() !== "").length;
  return Math.min(MAX_LETTERS, n);
}

// Vertical (tategaki) glyph handling: brackets and dashes turn sideways, small
// punctuation sits in the upper right of its cell.
const V_ROTATE = new Set(Array.from("ー－—―～〜…‥「」『』（）()【】〈〉《》［］[]｛｝{}<>-=→←"));
const V_CORNER = new Set(Array.from("、。，．,.'’"));

// ---------------------------------------------------------------------------
// Live tokens

export interface LiveToken {
  kind: number; // 1 count, 2 clock, 3 countdown, 4 walk, 5 random
  /** Placeholder text laid out in place of the token. */
  text: string;
  /** Letters (non-space) of the placeholder that are digits / separators hidden with leading zeros. */
  mask: number;
  sep: number;
  a: number;
  b: number;
  c: number;
  flags: number;
}

const digitsOf = (s: string) => s.replace(/[^0-9]/g, "");
const num = (s: string) => Number(s.replace(/[,\s]/g, "")) || 0;

function grouped(n: number, width: number, group: boolean): string {
  let s = String(Math.round(Math.abs(n))).padStart(width, "0");
  if (group) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return s;
}

function tokenMasks(text: string, digitChar = /[0-9]/): { mask: number; sep: number } {
  let mask = 0;
  let sep = 0;
  Array.from(text).forEach((ch, i) => {
    if (digitChar.test(ch)) mask |= 1 << i;
    else if (ch === ",") sep |= 1 << i;
  });
  return { mask, sep };
}

function parseClock(s: string): { secs: number; parts: number } {
  const p = s.trim().split(":").map((x) => Number(x) || 0);
  if (p.length >= 3) return { secs: p[0] * 3600 + p[1] * 60 + p[2], parts: 3 };
  if (p.length === 2) return { secs: p[0] * 3600 + p[1] * 60, parts: 2 };
  return { secs: p[0], parts: 1 };
}

function makeToken(kindWord: string, argRaw: string): LiveToken | null {
  const arg = argRaw.trim();
  const kw = kindWord.toLowerCase();
  const cap = (t: LiveToken) => (Array.from(t.text).length <= 16 ? t : null);
  if (kw === "count" || kw === "counter") {
    const m = /^([\d,]+)\s*(?:-|\.\.|to|→)\s*([\d,]+)/i.exec(arg) ?? /^()([\d,]+)/.exec(arg);
    if (!m) return null;
    const a = num(m[1] || "0");
    const b = num(m[2]);
    const group = arg.includes(",");
    const width = Math.max(digitsOf(m[1] || "0").length, digitsOf(m[2]).length, 1);
    const text = grouped(Math.max(a, b), width, group).replace(/[0-9]/g, "0");
    const { mask, sep } = tokenMasks(text);
    return cap({ kind: 1, text, mask, sep, a: Math.min(a, 16777215), b: Math.min(b, 16777215), c: 0, flags: 1 });
  }
  if (kw === "time" || kw === "clock") {
    const { secs, parts } = parseClock(arg || "21:47");
    const text = parts >= 3 ? "00:00:00" : "00:00";
    const { mask } = tokenMasks(text);
    return { kind: 2, text, mask, sep: 0, a: secs, b: parts >= 3 ? 6 : 4, c: 0, flags: 0 };
  }
  if (kw === "countdown" || kw === "timer") {
    const { secs, parts } = parseClock(arg || "10");
    const text = parts >= 3 ? "00:00:00" : parts === 2 ? "00:00" : "0".repeat(Math.max(2, digitsOf(arg).length));
    const secsAll = parts === 2 ? Math.round(secs / 60) : secs; // "MM:SS" reads as minutes:seconds
    const { mask } = tokenMasks(text);
    return cap({ kind: 3, text, mask, sep: 0, a: Math.min(secsAll, 16777215), b: parts >= 3 ? 6 : parts === 2 ? 4 : 2, c: 0, flags: 0 });
  }
  if (kw === "price" || kw === "walk") {
    const m = /^([\d,]*\.?\d+)\s*(?:±|\+-|\+\/-|\s)\s*([\d,]*\.?\d+)?/.exec(arg);
    if (!m) return null;
    const dec = m[1].includes(".") ? m[1].split(".")[1].length : 0;
    const f = Math.pow(10, dec);
    const base = Math.round(num(m[1]) * f);
    const amp = Math.round(num(m[2] ?? String(num(m[1]) * 0.03)) * f);
    const group = m[1].includes(",");
    const intW = Math.max(String(Math.floor((base + amp) / f)).length, 1);
    let text = grouped(Math.floor((base + amp) / f), intW, group).replace(/[0-9]/g, "0");
    if (dec > 0) text += "." + "0".repeat(dec);
    const { mask, sep } = tokenMasks(text);
    return cap({ kind: 4, text, mask, sep, a: Math.min(base, 16777215), b: Math.min(amp, 65535), c: dec, flags: 1 });
  }
  if (kw === "rand" || kw === "random") {
    const m = /^(\d+)(?:\s+([\d.]+)\s*hz)?/i.exec(arg);
    const n = Math.min(16, Math.max(1, Number(m?.[1] ?? 4)));
    const text = "0".repeat(n);
    return { kind: 5, text, mask: (1 << n) - 1, sep: 0, a: Math.round(Number(m?.[2] ?? 8) * 10), b: 0, c: 0, flags: 0 };
  }
  return null;
}

/** Replaces live tokens by placeholders; returns their placeholder ranges (string indices). */
function expandTokens(text: string): { text: string; tokens: (LiveToken & { start: number; end: number })[] } {
  const tokens: (LiveToken & { start: number; end: number })[] = [];
  let out = "";
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    const t = tokens.length < MAX_TOKENS ? makeToken(m[1], m[2]) : null;
    out += text.slice(last, m.index);
    if (t) {
      tokens.push({ ...t, start: out.length, end: out.length + t.text.length });
      out += t.text;
    } else out += m[0];
    last = m.index + m[0].length;
  }
  TOKEN_RE.lastIndex = 0;
  return { text: out + text.slice(last), tokens };
}

// ---------------------------------------------------------------------------
// Layout

interface Cell {
  ch: string;
  /** Glyph centre (message px, y down). */
  x: number;
  y: number;
  /** Letter cell (advance box × line box). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Index of the letter's first character in the (token-expanded) message text. */
  src: number;
  /** Vertical text: glyph turned sideways / nudged into the cell's upper right. */
  rot?: boolean;
  corner?: boolean;
  /** Live digit: drawn from the charset on the GPU, left out of the band (no ghost glow). */
  live?: boolean;
}

interface Block {
  msg: TextMessage;
  cells: Cell[];
  w: number;
  h: number;
  font: string;
  tokens: { k0: number; len: number; t: LiveToken }[];
}

const fontCss = (weight: number, px: number, family: string) => `${weight} ${px}px "${family}", ${FALLBACK}`;

function layoutBlock(ctx: CanvasRenderingContext2D, spec: TextSpec, msg0: TextMessage, px: number): Block {
  const { text, tokens } = expandTokens(msg0.text);
  const msg = { ...msg0, text };
  const font = fontCss(msg.weight, px, msg.family);
  ctx.font = font;
  const gap = spec.spacing * px;
  const lineStep = spec.lineHeight * px;
  const lines = msg.text.split("\n");
  const cells: Cell[] = [];
  let w = 0;
  let h = 0;
  let lineStart = 0;
  lines.forEach((line, li) => {
    let cursor = 0;
    for (const u of lineUnits(line)) {
      const ch = u.text;
      const blank = ch.trim() === "";
      const adv = spec.vertical ? px : Math.max(ctx.measureText(ch).width, blank ? px * 0.3 : px * 0.2);
      if (!blank && cells.length < MAX_LETTERS) {
        const src = lineStart + u.src;
        if (spec.vertical) {
          // Columns run right → left (CJK convention); letters stack top → bottom.
          const x = -li * lineStep;
          cells.push({ ch, src, x, y: cursor + px / 2, x0: x - lineStep / 2, x1: x + lineStep / 2, y0: cursor - gap / 2, y1: cursor + px + gap / 2, rot: V_ROTATE.has(ch), corner: V_CORNER.has(ch) });
        } else {
          const y = li * lineStep + px / 2;
          cells.push({ ch, src, x: cursor + adv / 2, y, x0: cursor - gap / 2, x1: cursor + adv + gap / 2, y0: y - lineStep / 2, y1: y + lineStep / 2 });
        }
      }
      cursor += adv + gap;
    }
    const len = Math.max(0, cursor - gap);
    if (spec.vertical) h = Math.max(h, len);
    else w = Math.max(w, len);
    lineStart += line.length + 1;
  });
  if (spec.vertical) {
    w = px + (lines.length - 1) * lineStep;
    const dx = w - px / 2;
    for (const c of cells) {
      c.x += dx;
      c.x0 += dx;
      c.x1 += dx;
    }
  } else h = px + (lines.length - 1) * lineStep;
  // Token → letter ranges (placeholders contain no spaces, so letters map 1:1 to characters).
  const blockTokens: Block["tokens"] = [];
  for (const t of tokens) {
    const k0 = cells.findIndex((c) => c.src >= t.start);
    if (k0 < 0) continue;
    let len = 0;
    while (k0 + len < cells.length && cells[k0 + len].src < t.end) len++;
    if (len > 0 && len <= 16) {
      blockTokens.push({ k0, len, t });
      for (let i = 0; i < len; i++) if (t.mask & (1 << i)) cells[k0 + i].live = true;
    }
  }
  return { msg, cells, w: Math.max(w, px * 0.3), h, font, tokens: blockTokens };
}

export interface TextAtlasLayout {
  em: number;
  padPx: number;
  width: number;
  height: number;
  bandW: number;
  bandH: number;
  chunkW: number;
  dataRows: number;
  blocks: Block[];
  /** First band of each message, chunks per message. */
  firstBand: number[];
  chunks: number[];
  charset: string[];
  charsetY: number;
  charsetCols: number;
  /** Charset index of "0" when live digits are used (-1 = none). */
  digitBase: number;
}

function layoutAtlas(spec: TextSpec, ctx: CanvasRenderingContext2D): TextAtlasLayout {
  const msgs = textMessages(spec);
  const live = msgs.some((m) => hasLiveTokens(m.text));
  let charset = graphemes(spec.charset ?? "").filter((c) => c.trim() !== "").slice(0, 96);
  if (live) charset = [..."0123456789", ...charset].slice(0, 106);
  let em = TEXT_EM;
  let out: TextAtlasLayout | null = null;
  for (let iter = 0; iter < 10; iter++) {
    const blocks = msgs.map((m) => layoutBlock(ctx, spec, m, em));
    const padPx = Math.ceil(TEXT_PAD * em);
    const maxW = Math.max(...blocks.map((b) => b.w));
    const maxH = Math.max(...blocks.map((b) => b.h));
    const chunkW = Math.max(8, Math.min(Math.ceil(maxW), MAX_SIDE - 2 * padPx));
    const bandW = chunkW + 2 * padPx;
    const bandH = Math.ceil(maxH) + 2 * padPx;
    const chunks = blocks.map((b) => Math.max(1, Math.ceil(b.w / chunkW - 1e-6)));
    const firstBand: number[] = [];
    let nb = 0;
    for (const c of chunks) {
      firstBand.push(nb);
      nb += c;
    }
    const letters = blocks.reduce((s, b) => s + b.cells.length, 0);
    const tokens = blocks.reduce((s, b) => s + b.tokens.length, 0);
    const dataLen = TXT_HEADER + msgs.length * TXT_MSG + letters * TXT_LETTER + tokens * TXT_TOKEN;
    const dataRows = Math.ceil(dataLen / bandW);
    const cell = charsetCell(em);
    const charsetCols = Math.max(1, Math.floor(bandW / cell));
    const charsetRows = charset.length ? Math.ceil(charset.length / charsetCols) : 0;
    const charsetY = dataRows + nb * bandH;
    const height = charsetY + charsetRows * cell;
    out = { em, padPx, width: bandW, height, bandW, bandH, chunkW, dataRows, blocks, firstBand, chunks, charset, charsetY: charset.length ? charsetY : 0, charsetCols, digitBase: live ? 0 : -1 };
    if (height <= MAX_SIDE && bandW <= MAX_SIDE) break;
    if (em <= 12) break;
    em = Math.max(12, Math.floor(em * Math.min(0.95, Math.sqrt(MAX_SIDE / height))));
  }
  return out!;
}

const layoutCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
const metricsCache = new Map<string, TextMetricsEm>();

export interface TextMetricsEm {
  /** Largest message block (letters only) in em. */
  w: number;
  h: number;
  messages: number;
}

/** Size of the lettering in em (widest message) — placement handles. */
export function textMetrics(spec: TextSpec): TextMetricsEm {
  const key = JSON.stringify(spec);
  let m = metricsCache.get(key);
  if (!m && layoutCanvas) {
    const lay = layoutAtlas(spec, layoutCanvas.getContext("2d")!);
    m = { w: Math.max(...lay.blocks.map((b) => b.w)) / lay.em, h: Math.max(...lay.blocks.map((b) => b.h)) / lay.em, messages: lay.blocks.length };
    if (metricsCache.size > 128) metricsCache.clear();
    metricsCache.set(key, m);
  }
  return m ?? { w: 1, h: 1, messages: 1 };
}

function drawGlyph(ctx: CanvasRenderingContext2D, c: Pick<Cell, "ch" | "rot" | "corner">, x: number, y: number, em: number, stroke: boolean): void {
  if (c.rot || c.corner) {
    ctx.save();
    ctx.translate(x + (c.corner ? em * 0.32 : 0), y - (c.corner ? em * 0.32 : 0));
    if (c.rot) ctx.rotate(Math.PI / 2);
    if (stroke) ctx.strokeText(c.ch, 0, 0);
    else ctx.fillText(c.ch, 0, 0);
    ctx.restore();
  } else if (stroke) ctx.strokeText(c.ch, x, y);
  else ctx.fillText(c.ch, x, y);
}

export function rasterizeText(spec: TextSpec, canvas: HTMLCanvasElement = document.createElement("canvas")): HTMLCanvasElement {
  const lay = layoutAtlas(spec, canvas.getContext("2d")!);
  const { em, padPx, bandW, bandH, chunkW, dataRows } = lay;
  const W = Math.max(8, lay.width);
  const H = Math.max(8, lay.height);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineStep = spec.lineHeight * em;

  lay.blocks.forEach((block, mi) => {
    const cells = block.cells;
    // Letter cells extended to the midpoints between neighbours (and past the block edges).
    const ext = cells.map((c) => {
      const along = spec.vertical ? cells.filter((o) => Math.abs(o.x - c.x) < 1e-3).sort((a, b) => a.y - b.y) : cells.filter((o) => Math.abs(o.y - c.y) < 1e-3).sort((a, b) => a.x - b.x);
      const k = along.indexOf(c);
      const big = 4 * padPx;
      if (spec.vertical) {
        const y0 = k === 0 ? -big : (along[k - 1].y + c.y) / 2;
        const y1 = k === along.length - 1 ? block.h + big : (c.y + along[k + 1].y) / 2;
        const x0 = c.x - em / 2 <= 1 ? -big : c.x - lineStep / 2;
        const x1 = c.x + em / 2 >= block.w - 1 ? block.w + big : c.x + lineStep / 2;
        return [x0, x1, y0, y1];
      }
      const x0 = k === 0 ? -big : (along[k - 1].x + c.x) / 2;
      const x1 = k === along.length - 1 ? block.w + big : (c.x + along[k + 1].x) / 2;
      const y0 = c.y - em / 2 <= 1 ? -big : c.y - lineStep / 2;
      const y1 = c.y + em / 2 >= block.h - 1 ? block.h + big : c.y + lineStep / 2;
      return [x0, x1, y0, y1];
    });
    for (let ch = 0; ch < lay.chunks[mi]; ch++) {
      const oy = dataRows + (lay.firstBand[mi] + ch) * bandH;
      const ox = padPx - ch * chunkW;
      const lo = ch * chunkW - padPx - em;
      const hi = (ch + 1) * chunkW + padPx + em;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, oy, bandW, bandH);
      ctx.clip();
      // Letter ids: cells overlap by a pixel (later wins) so no pixel is left without a letter.
      ctx.globalCompositeOperation = "source-over";
      cells.forEach((_, k) => {
        const [x0, x1, y0, y1] = ext[k];
        if (x1 < lo || x0 > hi) return;
        ctx.fillStyle = `rgb(0,0,${(k % 255) + 1})`;
        const rx = Math.floor(x0 + ox);
        const ry = Math.floor(y0 + oy + padPx);
        ctx.fillRect(rx, ry, Math.ceil(x1 + ox) - rx + 1, Math.ceil(y1 + oy + padPx) - ry + 1);
      });
      ctx.globalCompositeOperation = "lighter";
      ctx.font = block.font;
      ctx.fillStyle = "rgb(255,0,0)";
      for (const c of cells) if (c.x > lo && c.x < hi && !c.live) drawGlyph(ctx, c, c.x + ox, c.y + oy + padPx + em * 0.04, em, false);
      if (spec.stroke > 0) {
        ctx.strokeStyle = "rgb(0,255,0)";
        ctx.lineWidth = Math.max(1, spec.stroke * em);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const c of cells) if (c.x > lo && c.x < hi && !c.live) drawGlyph(ctx, c, c.x + ox, c.y + oy + padPx + em * 0.04, em, true);
      }
      ctx.restore();
    }
  });

  // Random-glyph cells (scramble, split-flap, glitch) and live digits.
  if (lay.charset.length) {
    const block0 = lay.blocks[0];
    ctx.font = block0.font;
    lay.charset.forEach((ch, k) => {
      const cell = charsetCell(em);
      const cx = (k % lay.charsetCols) * cell + cell / 2;
      const cy = lay.charsetY + Math.floor(k / lay.charsetCols) * cell + cell / 2;
      ctx.fillStyle = "rgb(255,0,0)";
      ctx.fillText(ch, cx, cy + em * 0.04);
      if (spec.stroke > 0) {
        ctx.strokeStyle = "rgb(0,255,0)";
        ctx.lineWidth = Math.max(1, spec.stroke * em);
        ctx.strokeText(ch, cx, cy + em * 0.04);
      }
    });
  }

  // Data stream.
  const data: number[] = [];
  const letters = lay.blocks.reduce((s, b) => s + b.cells.length, 0);
  const nTokens = lay.blocks.reduce((s, b) => s + b.tokens.length, 0);
  const tokStart = TXT_HEADER + lay.blocks.length * TXT_MSG + letters * TXT_LETTER;
  data.push(em, lay.blocks.length, dataRows, bandH, bandW, chunkW, padPx, lay.charsetY, lay.charsetCols, lay.charset.length, TXT_VERSION, letters, tokStart, nTokens, lay.digitBase < 0 ? 65535 : lay.digitBase, 0);
  let start = 0;
  lay.blocks.forEach((b, mi) => {
    const col = b.msg.color;
    data.push(b.cells.length, start, lay.firstBand[mi], lay.chunks[mi], Math.round(b.w), Math.round(b.h), col ? (col[0] << 8) | col[1] : 0, col ? (col[2] << 8) | 1 : 0);
    start += b.cells.length;
  });
  for (const b of lay.blocks) for (const c of b.cells) data.push(c.x0 + TXT_BIAS, c.x1 + TXT_BIAS, c.y0 + TXT_BIAS, c.y1 + TXT_BIAS);
  lay.blocks.forEach((b, mi) => {
    for (const { k0, len, t } of b.tokens) data.push(mi, k0, len, t.kind, t.mask, t.sep, t.a & 0xffff, Math.floor(t.a / 65536), t.b & 0xffff, Math.floor(t.b / 65536), t.c, t.flags);
  });
  const img = ctx.createImageData(W, dataRows);
  data.forEach((v, i) => {
    const q = Math.max(0, Math.min(65535, Math.round(v)));
    img.data[i * 4] = q >> 8;
    img.data[i * 4 + 1] = q & 255;
    img.data[i * 4 + 3] = 255;
  });
  for (let i = data.length; i < W * dataRows; i++) img.data[i * 4 + 3] = 255;
  ctx.putImageData(img, 0, 0);
  return canvas;
}
