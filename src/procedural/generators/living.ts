import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Living Light: smooth, organic animated light that ignores the window grid
 * (unless snapped to it) — heartbeats, a heart-monitor trace, music-like kick
 * pulses and equalizer bars synced to a BPM, cuttlefish / octopus skin
 * (chromatophores with passing dark clouds), water caustics, swaying flames /
 * aurora curtains, rain ripples and a slow breath. Minimal, seamless loops.
 */
export const livingGenerator: GeneratorDef = {
  id: "living",
  label: "Living Light",
  kind: "generator",
  description: "Heartbeat, ECG, music pulse & equalizer, octopus skin, caustics, swaying light, ripples, breath.",
  defaultBlend: "add",
  params: [
    e("pattern", "Pattern", "heartbeat", [
      ["heartbeat", "Heartbeat"],
      ["ecg", "Heart monitor line"],
      ["beat", "Music pulse (kick / snare / hats)"],
      ["equalizer", "Equalizer bars"],
      ["chroma", "Octopus skin"],
      ["caustics", "Water caustics"],
      ["sway", "Light sway (flames / aurora)"],
      ["ripples", "Rain ripples"],
      ["breath", "Breath"],
    ], { group: "Pattern" }),
    f("bpm", "Tempo", 72, 30, 200, { group: "Pattern", unit: "BPM", hint: "Heartbeat, music pulse, equalizer, monitor — rounded to whole beats per loop", random: 0.05 }),
    f("rate", "Rate", 0.1, 0, 2, { group: "Pattern", unit: "Hz", hint: "Speed of the other patterns", random: 0.1 }),
    f("scale", "Scale", 3, 0.2, 40, { group: "Pattern", hint: "Cells / waves per building height; bars, flames, beats across", random: 0.1 }),
    i("count", "Count", 24, 1, 128, { group: "Pattern", hint: "Equalizer bars, flames / curtains, monitor beats across", random: false }),
    f("originX", "Origin X", 0.5, -0.5, 1.5, { group: "Pattern", random: false }),
    f("originY", "Origin Y", 0.5, -0.5, 1.5, { group: "Pattern", hint: "Pulse centre, monitor line, equalizer baseline", random: false }),
    f("reach", "Reach", 0.6, 0.02, 3, { group: "Pattern", hint: "Pulse reach, bar / flame height, trace amplitude", random: 0.1 }),
    f("softness", "Softness", 0.5, 0, 1, { group: "Pattern", random: 0.1 }),
    f("sharpness", "Sharpness", 2, 0.25, 12, { group: "Pattern", random: 0.1 }),
    f("detail", "Detail", 0.5, 0, 1, { group: "Pattern", hint: "Noise, flicker and irregularity", random: 0.1 }),
    b("flip", "Flip / mirror", false, { group: "Pattern", hint: "Sway from the top (aurora), mirrored equalizer, monitor right → left" }),
    i("segments", "LED segments", 0, 0, 64, { group: "Pattern", hint: "Equalizer bars as stacked LED blocks (0 = smooth)", random: false }),

    c("colorA", "Colour", "#ff3b4e", { group: "Light", random: 0.04 }),
    c("colorB", "Second colour", "#2a0610", { group: "Light", random: 0.04 }),
    f("intensity", "Intensity", 3, 0, 40, { group: "Light", random: 0.05 }),
    f("base", "Base glow", 0.02, 0, 0.5, { group: "Light", hint: "Faint constant light in the second colour", random: 0.1 }),
    e("quantize", "Snap to", "none", [["none", "Free (smooth)"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]], { group: "Light" }),
  ],
};
