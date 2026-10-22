import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

const QUANTIZE: [string, string][] = [["none", "Free"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]];

/** Threshold / posterize the accumulated result. */
export const thresholdGenerator: GeneratorDef = {
  id: "threshold",
  label: "Threshold",
  kind: "mask",
  description: "Threshold or posterize everything below into a hard mask.",
  defaultBlend: "replace",
  params: [
    e("source", "Source", "luminance", [["luminance", "Luminance"], ["alpha", "Coverage"], ["max", "Max channel"]], { group: "Threshold" }),
    f("threshold", "Threshold", 0.5, 0, 8, { group: "Threshold", random: 0.05 }),
    f("softness", "Softness", 0.05, 0.001, 2, { group: "Threshold", random: 0.1 }),
    i("levels", "Posterize levels", 0, 0, 16, { group: "Threshold", hint: "0 = off", random: false }),
    b("invert", "Invert", false, { group: "Threshold" }),
    e("output", "Output", "mask", [["mask", "Mask original"], ["color", "Two-color"], ["alpha", "Coverage only"]], { group: "Output" }),
    c("colorA", "Low color", "#000000", { group: "Output", random: 0.05 }),
    c("colorB", "High color", "#ffffff", { group: "Output", random: 0.05 }),
    f("intensity", "Intensity", 2, 0, 30, { group: "Output", random: 0.06 }),
  ],
};

/** Blur / baked glow / horizontal streaks, sampled from the accumulated result. */
export const blurGenerator: GeneratorDef = {
  id: "blur",
  label: "Blur / Glow",
  kind: "modifier",
  description: "Soften, or bake a glow / streak into the texture.",
  defaultBlend: "replace",
  params: [
    e("mode", "Mode", "glow", [["blur", "Blur"], ["glow", "Glow (add)"]], { group: "Blur" }),
    f("radius", "Radius", 8, 0.5, 128, { group: "Blur", unit: "px@1k", random: 0.1 }),
    e("direction", "Direction", "both", [["both", "Both"], ["horizontal", "Horizontal streak"], ["vertical", "Vertical streak"]], { group: "Blur" }),
    i("taps", "Quality", 24, 8, 64, { group: "Blur", hint: "Samples per pixel", random: false }),
    f("threshold", "Glow threshold", 0.5, 0, 8, { group: "Glow", random: 0.1 }),
    f("intensity", "Glow intensity", 0.6, 0, 8, { group: "Glow", random: 0.08 }),
    c("tint", "Glow tint", "#ffffff", { group: "Glow", random: 0.04 }),
  ],
};

/** UV distortion of the accumulated result: noise warp, waves, glitch floor shifts, block glitches, pixelation. */
export const distortGenerator: GeneratorDef = {
  id: "distort",
  label: "Distortion",
  kind: "modifier",
  description: "Warp, glitch or pixelate everything below.",
  defaultBlend: "replace",
  params: [
    e("mode", "Mode", "noise", [
      ["noise", "Noise warp"],
      ["wave", "Wave"],
      ["floorShift", "Glitch floor shift"],
      ["blockGlitch", "Block glitch"],
      ["pixelate", "Pixelate"],
      ["windows", "Snap to windows"],
      ["liquid", "Liquid (domain warp)"],
      ["shear", "Floor shear"],
      ["tear", "Signal tearing"],
      ["datamosh", "Datamosh smear"],
      ["pixelSort", "Pixel sorting"],
      ["interlace", "Interlaced fields"],
      ["vhs", "VHS tracking"],
      ["compression", "Broken compression"],
      ["deadLines", "Dead lines"],
      ["vroll", "V-hold roll"],
    ], { group: "Distortion" }),
    f("amount", "Amount", 8, 0, 256, { group: "Distortion", unit: "px@1k", random: 0.1 }),
    f("scale", "Scale", 4, 0.25, 64, { group: "Distortion", random: 0.1 }),
    e("direction", "Direction", "horizontal", [["horizontal", "Horizontal"], ["vertical", "Vertical"], ["both", "Both"]], { group: "Distortion" }),
    f("rate", "Rate", 0.5, 0, 16, { group: "Distortion", unit: "Hz", random: 0.1 }),
    f("chance", "Glitch chance", 0.25, 0, 1, { group: "Distortion", hint: "Share of time steps with a glitch burst (pixel sorting: brightness threshold; compression: damage)", random: 0.1 }),
    f("pixelSize", "Pixel / block size", 8, 1, 128, { group: "Distortion", unit: "px@1k", hint: "Pixelate cells, macroblocks, tear bands, field lines", random: 0.1 }),
    f("rgbSplit", "RGB split", 0, 0, 64, { group: "Distortion", unit: "px@1k", random: 0.1 }),
  ],
};

/** Color grading of the accumulated result: hue, saturation, contrast, tint, gradient map, gain. */
export const colorGenerator: GeneratorDef = {
  id: "color",
  label: "Color Grade",
  kind: "color",
  description: "Hue / saturation / contrast / tint / gradient map on everything below.",
  defaultBlend: "replace",
  params: [
    f("hue", "Hue shift", 0, -180, 180, { group: "Grade", unit: "°", random: 0.03 }),
    f("hueCycle", "Hue cycle", 0, 0, 2, { group: "Grade", unit: "Hz", random: 0.1 }),
    f("saturation", "Saturation", 1, 0, 3, { group: "Grade", random: 0.08 }),
    f("contrast", "Contrast", 1, 0.2, 3, { group: "Grade", random: 0.08 }),
    f("gain", "Emission gain", 1, 0, 10, { group: "Grade", random: 0.05 }),
    c("tint", "Tint", "#ffffff", { group: "Grade", random: 0.04 }),
    f("tintAmount", "Tint amount", 0, 0, 1, { group: "Grade", random: 0.1 }),
    b("gradientMap", "Gradient map", false, { group: "Gradient map" }),
    c("mapA", "Shadows", "#1a0b3a", { group: "Gradient map", random: 0.05 }),
    c("mapB", "Mids", "#ff2d7a", { group: "Gradient map", random: 0.05 }),
    c("mapC", "Highlights", "#ffd27a", { group: "Gradient map", random: 0.05 }),
    f("mapRange", "Map range", 2, 0.05, 20, { group: "Gradient map", hint: "Luminance mapped to the highlight color", random: 0.1 }),
  ],
};

/** Building-aware flicker: global, per floor, per bay, per window or per unit. */
export const flickerGenerator: GeneratorDef = {
  id: "flicker",
  label: "Flicker",
  kind: "animation",
  description: "Multiplies everything below by seamless flicker patterns.",
  defaultBlend: "multiply",
  params: [
    e("scope", "Scope", "windows", [["global", "Whole building"], ["floors", "Per floor"], ["bays", "Per bay"], ["windows", "Per window"], ["units", "Per unit"]], { group: "Flicker" }),
    i("unitWidth", "Unit width", 3, 1, 16, { group: "Flicker", random: false }),
    e("style", "Style", "buzz", [["steps", "Random steps"], ["smooth", "Smooth noise"], ["strobe", "Strobe"], ["buzz", "Neon buzz"], ["dropout", "Dropouts"], ["fluorescent", "Faulty tube"]], { group: "Flicker" }),
    f("fraction", "Affected share", 0.3, 0, 1, { group: "Flicker", random: 0.1 }),
    f("rate", "Rate", 2, 0, 30, { group: "Flicker", unit: "Hz", random: 0.1 }),
    f("depth", "Depth", 0.8, 0, 1, { group: "Flicker", random: 0.1 }),
    f("duty", "Duty", 0.5, 0.02, 1, { group: "Flicker", random: 0.1 }),
    f("sync", "Synchronization", 0, 0, 1, { group: "Flicker", random: 0.1 }),
  ],
};

/** Building-scale brightness waves (sweeps, ripples, cascades), as modulator or emitter. */
export const waveGenerator: GeneratorDef = {
  id: "wave",
  label: "Wave",
  kind: "animation",
  description: "Seamless sweeps, ripples and cascades across the building.",
  defaultBlend: "multiply",
  params: [
    e("shape", "Shape", "linear", [["linear", "Linear"], ["radial", "Radial ripple"], ["diagonal", "Diagonal"], ["spiral", "Spiral (wraps)"]], { group: "Wave" }),
    e("direction", "Direction", "up", [["up", "Up"], ["down", "Down"], ["right", "Right"], ["left", "Left"]], { group: "Wave" }),
    e("profile", "Profile", "sine", [["sine", "Sine"], ["pulse", "Pulse band"], ["saw", "Sweep (saw)"], ["square", "Square"], ["triangle", "Triangle"], ["cascade", "Cascade fill"]], { group: "Wave" }),
    f("waves", "Waves", 1, 0.25, 32, { group: "Wave", random: 0.1 }),
    f("rate", "Rate", 0.2, 0, 8, { group: "Wave", unit: "Hz", random: 0.1 }),
    f("sharpness", "Sharpness", 2, 0.25, 32, { group: "Wave", random: 0.1 }),
    f("depth", "Depth", 0.8, 0, 1, { group: "Wave", random: 0.1 }),
    f("centerX", "Center X", 0.5, 0, 1, { group: "Wave", random: false }),
    f("centerY", "Center Y", 0.5, 0, 1, { group: "Wave", random: false }),
    e("quantize", "Snap to", "none", QUANTIZE, { group: "Wave" }),
    e("output", "Output", "modulate", [["modulate", "Modulate (multiply)"], ["emit", "Emit color"]], { group: "Output" }),
    c("colorA", "Color low", "#0a1e4a", { group: "Output", random: 0.05 }),
    c("colorB", "Color high", "#8fe8ff", { group: "Output", random: 0.05 }),
    f("intensity", "Intensity", 2, 0, 30, { group: "Output", random: 0.06 }),
  ],
};
