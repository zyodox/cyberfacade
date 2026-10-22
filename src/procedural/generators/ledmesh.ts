import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * LED Mesh: re-displays everything below through a grid of diodes — the fine
 * dot skins of media towers. Each diode shows the average of its cell, so films,
 * photos and text below read as a lit mesh with dark gaps between dots.
 */
export const ledmeshGenerator: GeneratorDef = {
  id: "ledmesh",
  label: "LED Mesh",
  kind: "modifier",
  description: "Turns the layers below into a dot/bar LED skin (free pitch or aligned to windows).",
  defaultBlend: "replace",
  params: [
    e("align", "Grid", "free", [
      ["free", "Free pitch"],
      ["windows", "Aligned to bays & floors"],
    ], { group: "Grid" }),
    f("pitch", "Pitch", 4, 1.5, 60, { group: "Grid", unit: "px@1k", random: 0.05 }),
    i("perBay", "Diodes per bay", 4, 1, 32, { group: "Grid", random: false }),
    i("perFloor", "Diodes per floor", 3, 1, 32, { group: "Grid", random: false }),
    e("shape", "Diode shape", "round", [
      ["round", "Round"],
      ["square", "Square"],
      ["hbar", "Horizontal bar"],
      ["vbar", "Vertical bar"],
    ], { group: "Grid" }),
    f("dotSize", "Diode size", 0.6, 0.05, 1, { group: "Grid", random: 0.05 }),
    b("stagger", "Staggered rows", false, { group: "Grid" }),

    f("gain", "Gain", 1.3, 0, 8, { group: "Signal", random: 0.05 }),
    f("threshold", "Threshold", 0.01, 0, 1, { group: "Signal", hint: "Diodes below this level stay dark", random: false }),
    i("levels", "Brightness steps", 0, 0, 16, { group: "Signal", hint: "0 = smooth; low values give a stepped, retro LED look", random: false }),
    f("offLevel", "Unlit diodes", 0, 0, 0.1, { group: "Signal", random: false }),
    c("offColor", "Unlit colour", "#6f86b8", { group: "Signal", random: false }),
    f("mixAmt", "Mix", 1, 0, 1, { group: "Signal", random: false }),

    i("cabinetW", "Cabinet width", 0, 0, 256, { group: "Hardware", hint: "Diodes per LED cabinet (module) across; 0 = one seamless screen", random: false }),
    i("cabinetH", "Cabinet height", 16, 1, 256, { group: "Hardware", hint: "Diodes per cabinet down", random: false }),
    f("cabinetVar", "Calibration spread", 0.12, 0, 1, { group: "Hardware", hint: "Brightness / tint differences between cabinets", random: 0.1 }),
    f("seam", "Seams", 0.4, 0, 2, { group: "Hardware", unit: "diodes", hint: "Dark gap between cabinets", random: false }),
    f("deadModules", "Faulty cabinets", 0, 0, 1, { group: "Hardware", hint: "Dead or stuck modules", random: 0.1 }),
    f("deadPixels", "Dead diodes", 0, 0, 1, { group: "Hardware", random: 0.1 }),
    f("refresh", "Refresh band", 0, 0, 1, { group: "Hardware", hint: "Rolling brightness band of a low refresh rate", random: 0.1 }),
  ],
};
