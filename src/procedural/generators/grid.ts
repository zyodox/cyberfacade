import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Facade structure lines: slab edges, mullions, custom grids, intersection
 * nodes and perimeter/corner lighting, with pulse / trace / scan animation.
 */
export const gridGenerator: GeneratorDef = {
  id: "grid",
  label: "Grid",
  kind: "generator",
  description: "Facade grid, structural lines and perimeter lighting.",
  defaultBlend: "add",
  params: [
    e("source", "Source", "arch", [["arch", "Architecture"], ["custom", "Custom"]], { group: "Layout" }),
    i("countX", "Columns / facade", 8, 1, 128, { group: "Layout", random: false }),
    i("countY", "Rows", 32, 1, 256, { group: "Layout", random: false }),
    e("lines", "Lines", "both", [["both", "Both"], ["horizontal", "Horizontal"], ["vertical", "Vertical"], ["none", "Edges only"]], { group: "Layout" }),
    i("everyX", "Every Nth column", 1, 1, 16, { group: "Layout", random: false }),
    i("everyY", "Every Nth row", 1, 1, 16, { group: "Layout", random: false }),
    f("offsetY", "Row offset", 0, 0, 1, { group: "Layout", random: false }),
    f("widthX", "Column width", 0.04, 0.001, 0.5, { group: "Layout", random: 0.1 }),
    f("widthY", "Row width", 0.04, 0.001, 0.5, { group: "Layout", random: 0.1 }),

    c("color", "Color", "#cfe0ff", { group: "Light", random: 0.05 }),
    f("intensity", "Intensity", 1, 0, 30, { group: "Light", random: 0.06 }),
    f("glow", "Glow", 0.2, 0, 2, { group: "Light", random: 0.1 }),
    f("glowWidth", "Glow width", 0.08, 0.005, 1, { group: "Light", random: 0.1 }),
    f("nodes", "Nodes", 0, 0, 10, { group: "Light", hint: "Brightness of line intersections", random: 0.1 }),
    f("nodeSize", "Node size", 0.08, 0.01, 0.5, { group: "Light", random: 0.1 }),
    f("edges", "Perimeter", 0, 0, 30, { group: "Light", hint: "Facade corners and roof/base edges", random: 0.06 }),
    f("edgeWidth", "Perimeter width", 2.5, 0.5, 24, { group: "Light", unit: "px@1k", random: 0.1 }),

    e("anim", "Animation", "none", [["none", "Static"], ["pulse", "Pulse"], ["trace", "Trace"], ["scan", "Scan"], ["twinkle", "Twinkle nodes"]], { group: "Animation" }),
    f("rate", "Rate", 0.2, 0, 4, { group: "Animation", unit: "Hz", random: 0.08 }),
    f("sync", "Synchronization", 0.5, 0, 1, { group: "Animation", random: 0.15 }),
    f("depth", "Depth", 0.7, 0, 1, { group: "Animation", random: 0.1 }),
    f("traceLength", "Trace length", 0.15, 0.01, 1, { group: "Animation", random: 0.1 }),
  ],
};
