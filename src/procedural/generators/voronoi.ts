import { b, c, e, f } from "../params";
import type { GeneratorDef } from "../types";

const QUANTIZE: [string, string][] = [["none", "Free"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]];

/** Cellular / Voronoi patterns: flat cells, glowing borders, distance fields; seamless orbiting sites. */
export const voronoiGenerator: GeneratorDef = {
  id: "voronoi",
  label: "Voronoi",
  kind: "generator",
  description: "Cellular pattern with animated sites, borders and blinking cells.",
  defaultBlend: "add",
  params: [
    e("mode", "Mode", "cells", [["cells", "Cells"], ["edges", "Borders"], ["distance", "Distance"], ["crackle", "Crackle"]], { group: "Pattern" }),
    f("scale", "Scale", 5, 0.5, 64, { group: "Pattern", hint: "Cells across one facade", random: 0.1 }),
    f("stretch", "Stretch", 1, 0.1, 10, { group: "Pattern", random: 0.1 }),
    f("jitter", "Jitter", 0.85, 0, 1, { group: "Pattern", random: 0.1 }),
    e("quantize", "Snap to", "none", QUANTIZE, { group: "Pattern" }),
    f("edgeWidth", "Border width", 0.06, 0.005, 0.5, { group: "Pattern", random: 0.1 }),

    f("drift", "Site motion", 0.1, 0, 2, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("density", "Density", 1, 0, 1, { group: "Animation", hint: "Fraction of cells lit", random: 0.1 }),
    f("flashRate", "Blink rate", 0, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("duty", "Blink duty", 0.5, 0.02, 1, { group: "Animation", random: 0.1 }),

    c("colorA", "Color A", "#39c6ff", { group: "Output", random: 0.05 }),
    c("colorB", "Color B", "#ff4fa3", { group: "Output", random: 0.05 }),
    f("colorMix", "Color B share", 0.3, 0, 1, { group: "Output", random: 0.1 }),
    f("brightnessVar", "Brightness variation", 0.5, 0, 1, { group: "Output", random: 0.1 }),
    f("intensity", "Intensity", 2, 0, 30, { group: "Output", random: 0.06 }),
    e("output", "Output", "emit", [["emit", "Emit color"], ["modulate", "Modulate (multiply)"]], { group: "Output" }),
    f("amount", "Modulation depth", 1, 0, 1, { group: "Output", random: 0.1 }),
    b("invert", "Invert", false, { group: "Output" }),
  ],
};
