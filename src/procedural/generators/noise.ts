import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Periodic (tileable in U and in time) gradient noise. Used to break repetition
 * across a facade, as a building-scale modulator, or snapped to the window grid
 * to drive per-window media-facade patterns.
 */
export const noiseGenerator: GeneratorDef = {
  id: "noise",
  label: "Noise",
  kind: "generator",
  description: "Seamless animated noise; modulator or emitter, optionally snapped to windows.",
  defaultBlend: "multiply",
  params: [
    e("noiseType", "Type", "fbm", [["fbm", "Fractal"], ["ridged", "Ridged"], ["turbulence", "Turbulence"], ["billow", "Billow"]], { group: "Pattern" }),
    f("scale", "Scale", 3, 0.5, 64, { group: "Pattern", hint: "Features across one facade", random: 0.1 }),
    i("octaves", "Octaves", 4, 1, 6, { group: "Pattern", random: false }),
    f("roughness", "Roughness", 0.5, 0.1, 0.9, { group: "Pattern", random: 0.1 }),
    f("stretch", "Stretch", 1, 0.1, 10, { group: "Pattern", hint: ">1 = horizontal streaks, <1 = vertical", random: 0.1 }),
    e("quantize", "Snap to", "none", [["none", "Free"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]], { group: "Pattern" }),

    f("contrast", "Contrast", 1, 0, 6, { group: "Shape", random: 0.1 }),
    f("bias", "Bias", 0, -1, 1, { group: "Shape", random: 0.1 }),
    f("threshold", "Threshold", 0, 0, 1, { group: "Shape", hint: "0 = off", random: 0.08 }),
    f("softness", "Threshold softness", 0.1, 0.001, 0.5, { group: "Shape", random: 0.1 }),
    b("invert", "Invert", false, { group: "Shape" }),

    f("evolve", "Evolution", 0.1, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    e("drift", "Drift", "none", [["none", "None"], ["left", "Left"], ["right", "Right"], ["up", "Up"], ["down", "Down"]], { group: "Animation" }),
    f("driftRate", "Drift rate", 0.1, 0, 2, { group: "Animation", unit: "Hz", random: 0.1 }),

    e("output", "Output", "modulate", [["modulate", "Modulate (multiply)"], ["emit", "Emit color"]], { group: "Output" }),
    f("amount", "Amount", 0.5, 0, 1, { group: "Output", hint: "Modulation depth", random: 0.1 }),
    c("colorA", "Color low", "#10203a", { group: "Output", random: 0.05 }),
    c("colorB", "Color high", "#9fd0ff", { group: "Output", random: 0.05 }),
    f("intensity", "Intensity", 1, 0, 20, { group: "Output", random: 0.06 }),
  ],
};
