import { assetMeta, resolveFontFamily } from "../../assets/assets";
import { asset, b, c, e, f, font, i, txt } from "../params";
import type { GeneratorDef, LayerInstance, MediaRef, TextSpec } from "../types";

const WEIGHTS: Record<string, number> = { thin: 200, light: 300, regular: 400, bold: 700, black: 900 };

function particleText(layer: LayerInstance): TextSpec | null {
  const p = layer.params;
  const text = String(p.text ?? "");
  if (!text.trim()) return null;
  return {
    text,
    family: resolveFontFamily(String(p.font ?? "")),
    weight: WEIGHTS[p.weight as string] ?? 400,
    vertical: false,
    spacing: 0.06,
    stroke: 0,
    lineHeight: 1.15,
    messages: true,
    charset: "",
  };
}

/**
 * Particles: thousands of GPU-instanced sprites — glow dots, sparks, pixels,
 * rings, flares, bokeh, your PNG / video, the letters or words of a text —
 * emitted from a point, line, area, circle, window cells or the whole facade.
 * Drift with gravity, drag, turbulence and swirl, or assemble into a word /
 * image and burst apart. Every particle lives a whole number of lives per
 * loop, so the animation loops seamlessly.
 */
export const particlesGenerator: GeneratorDef = {
  id: "particles",
  label: "Particles",
  kind: "generator",
  description: "GPU particles: sparks, dust, embers, PNG sprites, flying letters / words, text that assembles and bursts.",
  defaultBlend: "add",
  params: [
    e("sprite", "Particle", "dot", [
      ["dot", "Glow dot"],
      ["spark", "Spark (streak)"],
      ["square", "Pixel"],
      ["ring", "Ring"],
      ["star", "Star flare"],
      ["bokeh", "Bokeh disc"],
      ["image", "Image / video"],
      ["letters", "Letters of the text"],
      ["words", "Words (lines of the text)"],
    ], { group: "Particle" }),
    asset("file", "Image / video", ["image", "video"], { group: "Particle", hint: "Sprite for “Image / video”, or the shape particles assemble into" }),
    txt("text", "Text", "LUMEN", { group: "Particle", multiline: true, hint: "Letters / words to emit, or the word(s) to assemble into — one word per line" }),
    font("font", "Font", "Segoe UI", { group: "Particle" }),
    e("weight", "Weight", "bold", [["thin", "Thin"], ["light", "Light"], ["regular", "Regular"], ["bold", "Bold"], ["black", "Black"]], { group: "Particle" }),
    b("tint", "Tint image with colour", false, { group: "Particle" }),

    e("emitter", "Emitter", "area", [
      ["area", "Area"],
      ["line", "Line"],
      ["point", "Point"],
      ["ring", "Circle"],
      ["facade", "Whole facade"],
      ["windows", "Window cells"],
    ], { group: "Emitter" }),
    f("posX", "Centre X", 0.5, -0.5, 1.5, { group: "Emitter", random: false }),
    f("posY", "Centre Y", 0.5, -0.5, 1.5, { group: "Emitter", random: false, hint: "0 = bottom, 1 = top" }),
    f("emitW", "Width", 0.8, 0, 2, { group: "Emitter", hint: "Fraction of the texture width (circle: diameter)", random: false }),
    f("emitH", "Height", 0.6, 0, 2, { group: "Emitter", hint: "Fraction of the texture height", random: false }),
    i("count", "Count", 300, 1, 6000, { group: "Emitter", random: false }),
    f("life", "Life", 4, 0.2, 20, { group: "Emitter", unit: "s", hint: "Rounded so each particle lives a whole number of times per loop", random: 0.1 }),
    f("lifeVar", "Life variation", 0.3, 0, 0.9, { group: "Emitter", random: 0.1 }),

    e("motion", "Motion", "drift", [["drift", "Drift"], ["form", "Assemble into text / image"]], { group: "Motion" }),
    f("direction", "Direction", 90, 0, 360, { group: "Motion", unit: "°", hint: "0 = right, 90 = up, 270 = down", random: false }),
    f("spread", "Spread", 40, 0, 360, { group: "Motion", unit: "°", random: 0.1 }),
    f("speed", "Speed", 0.05, 0, 1.5, { group: "Motion", unit: "h/s", hint: "Building heights per second", random: 0.1 }),
    f("speedVar", "Speed variation", 0.5, 0, 1, { group: "Motion", random: 0.1 }),
    f("gravity", "Gravity", 0, -1, 1, { group: "Motion", unit: "h/s²", hint: "Negative pulls down", random: 0.1 }),
    f("drag", "Drag", 0, 0, 5, { group: "Motion", random: 0.1 }),
    f("turbulence", "Turbulence", 0.2, 0, 2, { group: "Motion", random: 0.1 }),
    f("turbScale", "Turbulence scale", 4, 0.3, 30, { group: "Motion", random: 0.1 }),
    f("swirl", "Swirl", 0, -1, 1, { group: "Motion", unit: "turn/s", hint: "Rotation around the emitter centre", random: 0.1 }),
    f("textSize", "Formed text size", 0.12, 0.01, 1, { group: "Motion", hint: "Assemble: letter height as a fraction of the texture width (image: uses Width)", random: false }),

    f("size", "Size", 5, 0.3, 300, { group: "Look", unit: "px@1k", random: 0.1 }),
    f("sizeVar", "Size variation", 0.5, 0, 1, { group: "Look", random: 0.1 }),
    f("sizeEnd", "Size at end", 0.6, 0, 3, { group: "Look", hint: "Size multiplier at the end of life", random: 0.1 }),
    f("stretch", "Streak length", 3, 0, 20, { group: "Look", hint: "Sparks: length along the motion", random: 0.1 }),
    f("spin", "Spin", 0, -2, 2, { group: "Look", unit: "turn/s", random: 0.1 }),
    f("rotation", "Random rotation", 0, 0, 1, { group: "Look", random: false }),
    c("colorA", "Colour A", "#ffd9a0", { group: "Look", random: 0.04 }),
    c("colorB", "Colour B", "#ff7a3c", { group: "Look", random: 0.04 }),
    e("colorMode", "Colour mix", "random", [["random", "Random per particle"], ["life", "A → B over life"], ["height", "By height"]], { group: "Look" }),
    f("intensity", "Intensity", 4, 0, 60, { group: "Look", random: 0.05 }),
    f("glow", "Glow", 0.5, 0, 3, { group: "Look", random: 0.1 }),
    f("fadeIn", "Fade in", 0.15, 0, 0.9, { group: "Look", random: false }),
    f("fadeOut", "Fade out", 0.4, 0, 0.9, { group: "Look", random: false }),
    f("twinkle", "Twinkle", 0, 0, 1, { group: "Look", random: 0.1 }),
    e("pblend", "Overlap", "add", [["add", "Add light"], ["over", "Stack (opaque sprites)"]], { group: "Look" }),
  ],
  extra(layer) {
    const ref = particlesGenerator.media!(layer, { phase: 0, duration: 1, speed: 1 });
    return [ref?.kind === "text" ? 1 : 0, 0];
  },
  particles(layer) {
    const p = layer.params;
    return { count: Math.max(1, Math.min(6000, Math.round(p.count as number))), over: p.pblend === "over" };
  },
  media(layer, ctx): MediaRef | null {
    const p = layer.params;
    const file = String(p.file ?? "");
    const wantsImage = p.sprite === "image" || (p.motion === "form" && file && p.sprite !== "letters" && p.sprite !== "words");
    if (wantsImage && file) {
      if (file[0] === "v") {
        // Video sprites play in whole repeats per loop.
        const D = assetMeta(file)?.duration || 1;
        const L = Math.max(0.1, ctx.duration);
        const n = Math.max(1, Math.round((L * ctx.speed) / D));
        const t = ctx.phase * n;
        return { kind: "video", assetId: file, time: (t - Math.floor(t)) * D, rate: (n * D) / L };
      }
      return { kind: "image", assetId: file };
    }
    if (p.sprite === "letters" || p.sprite === "words" || p.motion === "form") {
      const spec = particleText(layer);
      if (spec) return { kind: "text", spec, key: JSON.stringify(spec) };
    }
    return null;
  },
};
