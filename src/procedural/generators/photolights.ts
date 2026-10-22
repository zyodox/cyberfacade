import { b, c, e, f } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Photo Lights: finds the lit windows and lamps in the layers below (typically
 * an imported night photo of a facade) and animates every light on its own —
 * rooms switching on and off, gentle flicker, faulty tubes, TV glow, breathing.
 *
 * Lights are found on the GPU without a grid: each bright pixel climbs the
 * blurred brightness of the layers below (their mip chain) to its peak, and
 * every pixel that reaches the same peak belongs to the same light.
 */
export const photoLightsGenerator: GeneratorDef = {
  id: "photolights",
  label: "Photo Lights",
  kind: "animation",
  description: "Makes the lit windows and lamps of a photo below flicker, switch on and off and glow — each light on its own.",
  defaultBlend: "replace",
  blurredPrev: true,
  params: [
    f("sensitivity", "Sensitivity", 0.65, 0, 1, { group: "Detect lights", hint: "Higher = dimmer lights count too. A light is anything clearly brighter than its surroundings, so it works for dark and bright photos alike — tune it with Show detected lights", random: false }),
    f("softness", "Edge softness", 0.6, 0, 1, { group: "Detect lights", hint: "How much of the edge and glow around a light dims along with it (too low leaves bright rims when a light switches off)", random: false }),
    f("lightSize", "Light size", 24, 4, 256, { group: "Detect lights", unit: "px@1k", hint: "About one window of the photo: smaller splits lights apart, larger merges neighbours into one", random: false }),
    e("grouping", "Group lights by", "auto", [
      ["auto", "Detected lights"],
      ["grid", "Floors × bays grid"],
    ], { group: "Detect lights" }),
    b("showLights", "Show detected lights", false, { group: "Detect lights", hint: "Colours each detected light differently — check the grouping, then turn it off" }),

    e("mode", "Behaviour", "mixed", [
      ["mixed", "Mixed (realistic night)"],
      ["switch", "Rooms switching on / off"],
      ["flicker", "Gentle flicker"],
      ["faulty", "Faulty tubes"],
      ["tv", "TV glow"],
      ["breathe", "Slow breathing"],
    ], { group: "Animate" }),
    f("affected", "Animated share", 0.45, 0, 1, { group: "Animate", hint: "Share of the lights that animate; the rest stay steady", random: 0.1 }),
    f("switchRate", "Switching rate", 0.12, 0, 2, { group: "Animate", unit: "Hz", hint: "How often switching lights change state (also paces breathing and tube faults)", random: 0.1 }),
    f("offTime", "Time off", 0.35, 0, 1, { group: "Animate", hint: "Share of the time a switching light is off", random: 0.1 }),
    f("flickerRate", "Flicker rate", 6, 0.2, 30, { group: "Animate", unit: "Hz", random: 0.1 }),
    f("depth", "Flicker depth", 0.5, 0, 1, { group: "Animate", random: 0.1 }),
    f("sync", "Synchronization", 0, 0, 1, { group: "Animate", hint: "1 = all lights change together", random: false }),

    f("offLevel", "Light left when off", 0.06, 0, 1, { group: "Look", hint: "0 = pitch dark; a little keeps the glass and curtains visible", random: false }),
    f("gain", "Light brightness", 1, 0, 4, { group: "Look", random: 0.05 }),
    c("tvColor", "TV colour", "#7fa6ff", { group: "Look", random: 0.05 }),
  ],
};
