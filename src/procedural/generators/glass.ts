import { c, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Glass: refracts everything below through the curtain wall. Each pane bends
 * the image by its own small offset (real panes are never perfectly aligned),
 * a slow warp adds old-glass waviness, and tint, edge shading and diagonal
 * reflection streaks make the skin read as glass rather than a screen.
 */
export const glassGenerator: GeneratorDef = {
  id: "glass",
  label: "Glass",
  kind: "modifier",
  description: "Per-pane refraction, warp, tint and reflections over everything below.",
  defaultBlend: "replace",
  params: [
    i("panesX", "Panes per bay", 1, 1, 6, { group: "Panes", random: false }),
    i("panesY", "Panes per floor", 1, 1, 6, { group: "Panes", random: false }),
    f("refraction", "Pane offset", 3, 0, 40, { group: "Refraction", unit: "px@1k", random: 0.1 }),
    f("zoom", "Pane zoom", 0.03, 0, 0.3, { group: "Refraction", hint: "Each pane slightly magnifies the image", random: 0.1 }),
    f("warp", "Warp", 2, 0, 40, { group: "Refraction", unit: "px@1k", random: 0.1 }),
    f("warpScale", "Warp scale", 6, 0.5, 40, { group: "Refraction", random: 0.1 }),
    f("warpRate", "Warp rate", 0.05, 0, 2, { group: "Refraction", unit: "Hz", random: 0.1 }),
    f("dispersion", "Dispersion", 0, 0, 10, { group: "Refraction", unit: "px@1k", hint: "Colour fringing at pane offsets", random: 0.1 }),
    c("tint", "Tint", "#c8d2dc", { group: "Glass", random: 0.04 }),
    f("tintAmount", "Tint amount", 0.2, 0, 1, { group: "Glass", random: 0.1 }),
    f("edgeShade", "Edge shading", 0.35, 0, 1, { group: "Glass", random: 0.1 }),
    f("reflection", "Reflection", 0.08, 0, 1, { group: "Reflection", random: 0.1 }),
    c("reflectColor", "Reflection colour", "#8aa0c8", { group: "Reflection", random: 0.04 }),
    f("reflectAngle", "Streak angle", 35, -80, 80, { group: "Reflection", unit: "°", random: 0.05 }),
    f("streaks", "Streak density", 3, 0.5, 20, { group: "Reflection", random: 0.1 }),
  ],
};
