import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/** SDF geometric shapes (single, tiled, concentric ripples, radial arrays) — media-facade graphics. */
export const shapesGenerator: GeneratorDef = {
  id: "shapes",
  label: "Shapes",
  kind: "generator",
  description: "Geometric graphics: rings, chevrons, diamonds… animated, snappable to windows.",
  defaultBlend: "add",
  params: [
    e("shape", "Shape", "ring", [["circle", "Circle"], ["ring", "Ring"], ["square", "Square"], ["diamond", "Diamond"], ["triangle", "Triangle"], ["cross", "Cross"], ["chevron", "Chevron"], ["hexagon", "Hexagon"]], { group: "Shape" }),
    e("arrangement", "Layout", "single", [["single", "Single"], ["tiled", "Tiled"], ["ripple", "Concentric ripple"], ["radial", "Radial array"]], { group: "Shape" }),
    i("countX", "Tiles across", 3, 1, 32, { group: "Shape", random: false }),
    i("countY", "Tiles down", 6, 1, 64, { group: "Shape", random: false }),
    i("radialCount", "Radial count", 8, 2, 32, { group: "Shape", random: false }),
    f("size", "Size", 0.3, 0.01, 2, { group: "Shape", random: 0.08 }),
    f("thickness", "Stroke", 0, 0, 1, { group: "Shape", hint: "0 = filled", random: 0.08 }),
    f("rotation", "Rotation", 0, 0, 360, { group: "Shape", unit: "°", random: false }),
    f("centerX", "Center X", 0.5, 0, 1, { group: "Shape", random: false }),
    f("centerY", "Center Y", 0.5, 0, 1, { group: "Shape", random: false }),
    f("rippleSpacing", "Ripple spacing", 0.12, 0.01, 1, { group: "Shape", random: 0.1 }),
    e("quantize", "Snap to", "none", [["none", "Free"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]], { group: "Shape" }),

    f("spin", "Spin", 0, 0, 2, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("pulse", "Pulse rate", 0.2, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("pulseAmount", "Pulse amount", 0.2, 0, 1, { group: "Animation", random: 0.1 }),
    f("expand", "Ripple speed", 0.2, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("stagger", "Stagger", 0, 0, 1, { group: "Animation", hint: "Per-tile phase randomness", random: 0.1 }),

    c("colorA", "Color A", "#ffcc55", { group: "Look", random: 0.05 }),
    c("colorB", "Color B", "#ff3030", { group: "Look", random: 0.05 }),
    e("colorMode", "Coloring", "solid", [["solid", "Solid A"], ["alternate", "Alternate tiles"], ["radial", "Center → edge"], ["ripple", "Per ripple"]], { group: "Look" }),
    f("softness", "Softness", 0.004, 0, 0.2, { group: "Look", random: 0.1 }),
    f("glow", "Glow", 0.3, 0, 2, { group: "Look", random: 0.1 }),
    f("glowWidth", "Glow width", 0.03, 0.002, 0.5, { group: "Look", random: 0.1 }),
    f("intensity", "Intensity", 3, 0, 30, { group: "Look", random: 0.06 }),
  ],
};
