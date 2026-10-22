import { resolveFontFamily } from "../../assets/assets";
import { textMetrics } from "../../assets/textRaster";
import { b, c, e, f, font, txt } from "../params";
import type { GeneratorDef, LayerInstance, MediaRef, TextSpec } from "../types";

const WEIGHTS: Record<string, number> = { thin: 200, light: 300, regular: 400, bold: 700, black: 900 };

export const CHARSETS: Record<string, string> = {
  latin: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=",
  digits: "0123456789",
  katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン",
  binary: "01",
  hex: "0123456789ABCDEF",
  symbols: "#%&@$*+=<>/\\|?!~^",
  blocks: "█▓▒░▀▄▌▐■□▪▫",
  kanji: "電気夜光東京新愛夢龍未来都市街道駅店酒薬医病院銀行映画館楽音声速走飛火水金木土日月星空海山川花雨雪風雷鉄機械人生死命神",
  hangul: "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추",
  cyrillic: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ",
  arabic: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
  mixed: "A7Kアカサ電夜光가나다ЖЯФ#%&01Zタナ気京사자Щ",
};

/** Animations / transitions that show random glyphs (need the charset in the atlas). */
const RANDOM_GLYPH_ANIMS = new Set(["scramble", "glitch", "flap"]);
const RANDOM_GLYPH_TRANSITIONS = new Set(["scramble", "flap", "glitch"]);

export function signTextSpec(layer: LayerInstance): TextSpec | null {
  const p = layer.params;
  const text = String(p.text ?? "");
  if (!text.trim()) return null;
  const messages = !!p.messages;
  const needsChars = RANDOM_GLYPH_ANIMS.has(p.anim as string) || (messages && RANDOM_GLYPH_TRANSITIONS.has(p.transition as string));
  return {
    text,
    family: resolveFontFamily(String(p.font ?? "")),
    weight: WEIGHTS[p.weight as string] ?? 400,
    vertical: !!p.vertical,
    spacing: p.spacing as number,
    stroke: p.style === "outline" ? (p.tube as number) : 0,
    lineHeight: p.lineHeight as number,
    messages,
    charset: needsChars ? (CHARSETS[p.charset as string] ?? CHARSETS.latin) : "",
  };
}

/**
 * Sign / Text: typography on the facade — neon tubes with hot cores and glow,
 * neon outlines, lit letters, lightboxes and LED dot letters. Kinetic type:
 * rotating messages (brand names, cafés, electronics) with glitch / scramble /
 * split-flap / roll / wipe… transitions, per-letter animation (wave, rise,
 * drop, pop, chase, scramble…), long tickers crossing the facade, and cut-out
 * letters that reveal the layers below. Any system font or an imported font
 * (CJK included); a line can pick its own font and colour with a `{…}` tag.
 */
export const signGenerator: GeneratorDef = {
  id: "sign",
  label: "Sign / Text",
  kind: "generator",
  description: "Neon, lightbox or LED lettering, rotating billboard messages, kinetic type and tickers.",
  defaultBlend: "normal",
  params: [
    txt("text", "Text", "夜", { group: "Text", multiline: true, hint: "With “Each line is a message”, lines rotate. Start a line with {Font, bold, #ff3366} to style it." }),
    font("font", "Font", "Yu Gothic", { group: "Text" }),
    e("weight", "Weight", "regular", [
      ["thin", "Thin"],
      ["light", "Light"],
      ["regular", "Regular"],
      ["bold", "Bold"],
      ["black", "Black"],
    ], { group: "Text" }),
    b("vertical", "Vertical (stacked letters)", false, { group: "Text" }),
    f("spacing", "Letter spacing", 0.08, -0.3, 1.5, { group: "Text", unit: "em", random: false }),
    f("lineHeight", "Line spacing", 1.2, 0.6, 3, { group: "Text", unit: "em", random: false }),

    e("style", "Style", "neon", [
      ["neon", "Neon tube"],
      ["outline", "Neon outline"],
      ["solid", "Lit letters"],
      ["lightbox", "Lightbox (dark letters)"],
      ["led", "LED dot letters"],
    ], { group: "Style" }),
    e("output", "Render as", "light", [
      ["light", "Light"],
      ["reveal", "Cut-out: reveal layers below"],
      ["revealFull", "Cut-out, rest of facade dark"],
      ["knockout", "Stencil: cut letters out of layers below"],
    ], { group: "Style" }),
    f("revealGain", "Reveal brightness", 1.2, 0, 8, { group: "Style", hint: "Brightness of the layers seen through cut-out letters", random: 0.05 }),
    f("tube", "Outline width", 0.035, 0.005, 0.2, { group: "Style", unit: "em", random: false }),
    f("ledPitch", "LED pitch", 3, 1, 30, { group: "Style", unit: "px@1k", random: false }),

    f("posX", "Centre X", 0.5, -0.5, 1.5, { group: "Placement", random: false }),
    f("posY", "Centre Y", 0.5, -0.5, 1.5, { group: "Placement", random: false, hint: "0 = bottom, 1 = top" }),
    f("size", "Letter size", 0.2, 0.004, 1.5, { group: "Placement", random: false, hint: "Letter height as a fraction of the texture width" }),

    c("color", "Colour", "#f2f6ff", { group: "Light", random: 0.03 }),
    f("intensity", "Intensity", 5, 0, 40, { group: "Light", random: 0.05 }),
    f("core", "Hot core", 0.45, 0, 1, { group: "Light", hint: "Neon tubes burn whiter at their centre", random: 0.05 }),
    f("glow", "Glow", 0.7, 0, 4, { group: "Light", random: 0.05 }),
    f("glowRadius", "Glow radius", 0.45, 0, 1, { group: "Light", random: 0.05 }),
    f("unlit", "Unlit tube", 0.015, 0, 0.2, { group: "Light", hint: "Faint glass of switched-off letters", random: false }),

    f("plate", "Backing plate", 0, 0, 1, { group: "Panel", random: false }),
    c("plateColor", "Plate / box colour", "#101114", { group: "Panel", random: false }),
    f("plateLight", "Box light", 0, 0, 20, { group: "Panel", hint: "Lightbox brightness (lightbox style) or plate backlight", random: 0.05 }),
    f("padding", "Padding", 0.3, 0, 1.2, { group: "Panel", unit: "em", random: false }),
    f("border", "Border tube", 0, 0, 20, { group: "Panel", random: 0.05 }),

    e("anim", "Animation", "none", [
      ["none", "Steady"],
      ["flicker", "Faulty flicker"],
      ["sequence", "Letter sequence"],
      ["typewriter", "Type on / off"],
      ["pulse", "Breathe"],
      ["scroll", "Scroll / ticker"],
      ["wave", "Wave (letters bob)"],
      ["rise", "Rise in / out (masked)"],
      ["drop", "Drop in (bounce)"],
      ["pop", "Pop (scale)"],
      ["spread", "Tracking breathe"],
      ["chase", "Light chase"],
      ["scramble", "Scramble / decode"],
      ["glitch", "Glitch"],
      ["flap", "Split-flap"],
      ["blink", "Blink"],
      ["shimmer", "Shimmer (sheen)"],
    ], { group: "Animation" }),
    f("rate", "Rate", 0.2, 0.02, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("amount", "Motion amount", 1, 0, 2, { group: "Animation", hint: "Wave height, bounce, pop overshoot, spread, glitch density", random: 0.1 }),
    f("stagger", "Letter stagger", 0.5, 0, 1, { group: "Animation", hint: "0 = all letters together, 1 = strictly one after another", random: 0.1 }),
    f("flickerAmt", "Faulty letters", 0.3, 0, 1, { group: "Animation", random: 0.1 }),
    c("accent", "Accent colour", "#ffffff", { group: "Animation", hint: "Chase highlight, shimmer, scrambled glyphs, wipe edge", random: 0.03 }),
    e("charset", "Random glyphs", "latin", [
      ["latin", "A–Z 0–9"],
      ["digits", "Digits"],
      ["katakana", "Katakana"],
      ["kanji", "Kanji"],
      ["hangul", "Hangul"],
      ["cyrillic", "Cyrillic"],
      ["arabic", "Arabic"],
      ["mixed", "Mixed scripts"],
      ["hex", "Hex"],
      ["binary", "Binary"],
      ["symbols", "Symbols"],
      ["blocks", "Blocks"],
    ], { group: "Animation" }),
    f("tickerWidth", "Ticker window", 0, 0, 4, { group: "Animation", hint: "Scroll: length of the window the text travels through (fraction of the texture width, or height for up / down). 0 = wraps inside its own box", random: false }),
    e("tickerDir", "Ticker direction", "auto", [
      ["auto", "Auto (vertical text scrolls up)"],
      ["left", "Right → left"],
      ["right", "Left → right"],
      ["up", "Upward (vertical text / credits)"],
      ["down", "Downward (vertical text)"],
    ], { group: "Animation" }),
    f("scrollSpeed", "Ticker speed", 4, 0.2, 40, { group: "Animation", unit: "em/s", random: 0.1 }),
    f("tickerGap", "Ticker gap", 3, 0, 30, { group: "Animation", unit: "em", random: false }),
    b("wrapAround", "Seamless wrap", false, { group: "Animation", hint: "The strip loops seamlessly across the texture's left / right edge (set the ticker window to 1)" }),

    b("messages", "Each line is a message", false, { group: "Messages" }),
    f("hold", "Message time", 2.5, 0.3, 20, { group: "Messages", unit: "s", hint: "Rounded so every message shows a whole number of times per loop", random: 0.1 }),
    e("transition", "Transition", "glitch", [
      ["cut", "Cut"],
      ["fade", "Cross-fade"],
      ["glitch", "Glitch"],
      ["scramble", "Scramble / decode"],
      ["flap", "Split-flap"],
      ["roll", "Roll up"],
      ["push", "Push left"],
      ["wipe", "Wipe"],
      ["dissolve", "Dissolve"],
      ["type", "Delete / type"],
      ["blur", "Blur"],
      ["pixel", "Pixelate"],
      ["flicker", "Neon flicker"],
      ["zoom", "Zoom"],
    ], { group: "Messages" }),
    f("transTime", "Transition time", 0.6, 0.05, 4, { group: "Messages", unit: "s", random: 0.1 }),
  ],
  extra(layer) {
    const spec = signTextSpec(layer);
    if (!spec) return [1, 1];
    const m = textMetrics(spec);
    return [m.w, m.h];
  },
  media(layer): MediaRef | null {
    const spec = signTextSpec(layer);
    if (!spec) return null;
    return { kind: "text", spec, key: JSON.stringify(spec) };
  },
};
