import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Architectural LED strips / linear luminaires. Floor- or bay-aligned (or a free
 * count), segmented at mullions or rendered as discrete LED pixels, with
 * seamless chase, wave, cascade, pulse, sparkle and scan animation.
 */
export const stripesGenerator: GeneratorDef = {
  id: "stripes",
  label: "LED Strips",
  kind: "generator",
  description: "Linear LED strips aligned to floors or bays.",
  defaultBlend: "add",
  params: [
    e("orientation", "Orientation", "horizontal", [["horizontal", "Horizontal"], ["vertical", "Vertical"]], { group: "Layout" }),
    e("align", "Alignment", "arch", [["arch", "Floors / bays"], ["count", "Free count"]], { group: "Layout" }),
    i("count", "Count", 24, 1, 256, { group: "Layout", hint: "Strips across the texture when alignment is Free count", random: false }),
    i("every", "Every Nth", 1, 1, 16, { group: "Layout", random: false }),
    e("anchor", "Anchor", "slabTop", [["edge", "Cell edge"], ["slabCenter", "Slab center"], ["slabTop", "Slab top"], ["center", "Cell center"]], { group: "Layout" }),
    f("offset", "Offset", 0, -0.5, 0.5, { group: "Layout", random: false }),
    f("width", "Width", 0.04, 0.002, 1, { group: "Layout", hint: "Fraction of a floor/bay", random: 0.1 }),

    e("segments", "Segments", "continuous", [["continuous", "Continuous"], ["bays", "Break at mullions"], ["pixels", "LED pixels"]], { group: "Segments" }),
    f("gap", "Gap", 0.1, 0, 0.9, { group: "Segments", random: 0.1 }),
    f("pitch", "Pixels per cell", 8, 1, 64, { group: "Segments", step: 1, random: false }),

    c("colorA", "Color A", "#fff1dc", { group: "Color", random: 0.05 }),
    c("colorB", "Color B", "#86b8ff", { group: "Color", random: 0.05 }),
    e("gradient", "Gradient", "none", [["none", "Solid A"], ["along", "Along strip"], ["across", "Across building"], ["random", "Random per strip"], ["segment", "Random per segment"]], { group: "Color" }),
    f("intensity", "Intensity", 4, 0, 30, { group: "Color", random: 0.06 }),
    f("taper", "Taper", 0, -1, 1, { group: "Color", hint: "Brightness ramp along the strip", random: 0.1 }),
    f("glow", "Glow", 0.3, 0, 2, { group: "Color", random: 0.1 }),
    f("glowWidth", "Glow width", 0.1, 0.005, 1, { group: "Color", random: 0.1 }),

    e("anim", "Animation", "none", [["none", "Static"], ["pulse", "Pulse"], ["chase", "Chase"], ["wave", "Wave"], ["cascade", "Cascade"], ["sparkle", "Sparkle"], ["scan", "Scan"]], { group: "Animation" }),
    f("rate", "Rate", 0.25, 0, 4, { group: "Animation", unit: "Hz", random: 0.08 }),
    b("reverse", "Reverse direction", false, { group: "Animation" }),
    b("alternate", "Alternate strips", false, { group: "Animation" }),
    f("sync", "Synchronization", 1, 0, 1, { group: "Animation", hint: "1 = all strips in phase", random: 0.15 }),
    f("depth", "Depth", 0.8, 0, 1, { group: "Animation", hint: "How dark the animation dips", random: 0.1 }),
    f("waves", "Waves / dashes", 1, 0.25, 32, { group: "Animation", random: 0.1 }),
    f("sharpness", "Sharpness", 2, 0.5, 24, { group: "Animation", random: 0.1 }),
  ],
};
