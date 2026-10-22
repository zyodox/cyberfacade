import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Random rectangular blocks built from whole window cells (recursive splits of
 * a coarse grid) — media-facade panels, billboards, signage, lit office zones.
 */
export const blocksGenerator: GeneratorDef = {
  id: "blocks",
  label: "Random Blocks",
  kind: "generator",
  description: "Window-aligned rectangular blocks with seamless on/off timing.",
  defaultBlend: "add",
  params: [
    e("source", "Grid", "arch", [["arch", "Window cells"], ["custom", "Custom grid"]], { group: "Layout" }),
    i("countX", "Columns / facade", 32, 1, 256, { group: "Layout", random: false }),
    i("countY", "Rows", 64, 1, 512, { group: "Layout", random: false }),
    i("blockW", "Block width", 4, 1, 64, { group: "Layout", hint: "In cells", random: false }),
    i("blockH", "Block height", 3, 1, 64, { group: "Layout", hint: "In cells", random: false }),
    i("splits", "Splits", 2, 0, 4, { group: "Layout", random: false }),
    f("gap", "Gap", 0.15, 0, 0.9, { group: "Layout", hint: "Dark gap between blocks, in cells", random: 0.1 }),

    e("style", "Style", "solid", [["solid", "Solid"], ["outline", "Outline"], ["cells", "Window pixels"], ["gradient", "Gradient fill"]], { group: "Look" }),
    f("outline", "Outline width", 0.2, 0.02, 2, { group: "Look", hint: "In cells", random: 0.1 }),
    c("colorA", "Color A", "#ff2a55", { group: "Look", random: 0.05 }),
    c("colorB", "Color B", "#20d8ff", { group: "Look", random: 0.05 }),
    f("colorMix", "Color B share", 0.35, 0, 1, { group: "Look", random: 0.1 }),
    f("brightnessVar", "Brightness variation", 0.4, 0, 1, { group: "Look", random: 0.1 }),
    f("intensity", "Intensity", 3, 0, 30, { group: "Look", random: 0.06 }),

    f("density", "Density", 0.6, 0, 1, { group: "Animation", hint: "Fraction of blocks lit", random: 0.1 }),
    f("rate", "Switch rate", 0.2, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("duty", "On time", 0.6, 0.02, 1, { group: "Animation", random: 0.1 }),
    f("fade", "Fade", 0.05, 0.001, 0.4, { group: "Animation", random: 0.1 }),
    f("sync", "Synchronization", 0, 0, 1, { group: "Animation", random: 0.1 }),

    e("output", "Output", "emit", [["emit", "Emit color"], ["modulate", "Modulate (multiply)"]], { group: "Output" }),
    f("amount", "Modulation depth", 1, 0, 1, { group: "Output", random: 0.1 }),
  ],
};
