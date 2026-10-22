import { asset, c, e, f } from "../params";
import type { GeneratorDef, MediaRef } from "../types";

/**
 * Vector Logo: an imported SVG (or PNG) brand mark rendered as neon tubes that
 * draw themselves on along the logo's own paths — then the artwork lights up.
 * Also: all paths at once, a pulse chasing through the tubes, faulty tubes,
 * glitch, a hologram scan build, and LED dots.
 */
export const logoGenerator: GeneratorDef = {
  id: "logo",
  label: "Vector Logo",
  kind: "generator",
  description: "SVG / PNG logo as neon tubes that trace on along their paths, lit artwork or LED dots.",
  defaultBlend: "normal",
  params: [
    asset("file", "Logo (SVG or PNG)", ["image"], { group: "Logo", hint: "SVG draws on in the order its paths were drawn; PNG logos trace around their outline" }),
    e("style", "Style", "neon", [
      ["neon", "Neon tubes"],
      ["neonFill", "Neon outline + lit artwork"],
      ["fill", "Lit artwork"],
      ["led", "LED dots"],
    ], { group: "Logo" }),
    f("tube", "Tube width", 0.012, 0.002, 0.06, { group: "Logo", hint: "Fraction of the logo size (re-renders the tube map)", random: false }),

    f("posX", "Centre X", 0.5, -0.5, 1.5, { group: "Placement", random: false }),
    f("posY", "Centre Y", 0.6, -0.5, 1.5, { group: "Placement", random: false, hint: "0 = bottom, 1 = top" }),
    f("size", "Width", 0.55, 0.01, 2, { group: "Placement", random: false, hint: "Fraction of the texture width (incl. a glow margin)" }),

    e("colorMode", "Colour", "tint", [
      ["tint", "One colour"],
      ["original", "Logo colours"],
      ["gradient", "Gradient along the paths"],
    ], { group: "Light" }),
    c("color", "Colour", "#ff2d6f", { group: "Light", random: 0.03 }),
    c("colorB", "Gradient end", "#35d4ff", { group: "Light", random: 0.03 }),
    f("intensity", "Intensity", 5, 0, 40, { group: "Light", random: 0.05 }),
    f("core", "Hot core", 0.45, 0, 1, { group: "Light", random: 0.05 }),
    f("glow", "Glow", 0.8, 0, 4, { group: "Light", random: 0.05 }),
    f("glowRadius", "Glow radius", 0.45, 0, 1, { group: "Light", random: 0.05 }),
    f("unlit", "Unlit tube", 0.02, 0, 0.2, { group: "Light", hint: "Glass of tubes not drawn yet", random: false }),
    f("fillLevel", "Artwork brightness", 1, 0, 8, { group: "Light", random: 0.05 }),
    f("ledPitch", "LED pitch", 3, 1, 30, { group: "Light", unit: "px@1k", random: false }),

    e("anim", "Animation", "trace", [
      ["none", "Steady"],
      ["trace", "Trace on / off"],
      ["traceFill", "Trace, then light the artwork"],
      ["allPaths", "All paths trace at once"],
      ["chase", "Pulse chasing the tubes"],
      ["flicker", "Faulty tubes"],
      ["pulse", "Breathe"],
      ["glitch", "Glitch"],
      ["scan", "Hologram scan build"],
    ], { group: "Animation" }),
    f("rate", "Rate", 0.1, 0.02, 2, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("drawTime", "Draw time", 0.4, 0.05, 0.9, { group: "Animation", hint: "Share of each cycle spent drawing", random: 0.1 }),
    f("amount", "Amount", 1, 0, 2, { group: "Animation", hint: "Faulty tubes, glitch density, chase pulse length", random: 0.1 }),
    c("accent", "Spark / pulse colour", "#ffffff", { group: "Animation", random: 0.03 }),
  ],
  media(layer): MediaRef | null {
    const id = String(layer.params.file ?? "");
    if (!id) return null;
    const stroke = Math.round((layer.params.tube as number) * 2000) / 2000;
    return { kind: "logo", assetId: id, stroke, key: `${id}|${stroke}` };
  },
};
