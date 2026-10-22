import { b, c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Small Lights: the sparse point lights that make a dark facade feel
 * inhabited and huge — scattered specks, aviation beacons, strings of tiny
 * lights along ledges or mullions, and regular dot grids.
 */
export const lightsGenerator: GeneratorDef = {
  id: "lights",
  label: "Small Lights",
  kind: "generator",
  description: "Sparse specks, aviation beacons, light strings and dot grids — tiny points with soft halos.",
  defaultBlend: "add",
  params: [
    e("mode", "Type", "specks", [
      ["specks", "Scattered specks"],
      ["beacons", "Aviation beacons"],
      ["strings", "Light strings"],
      ["dots", "Dot grid"],
    ], { group: "Layout" }),
    f("density", "Density", 0.1, 0, 1, { group: "Layout", random: 0.1 }),
    i("subdiv", "Cells per window", 2, 1, 8, { group: "Layout", hint: "Specks: candidate spots per bay/floor cell", random: false }),
    i("everyX", "Every … bays", 1, 1, 32, { group: "Layout", random: false }),
    i("everyY", "Every … floors", 1, 1, 40, { group: "Layout", random: false }),
    f("cellX", "Position in bay", 0.5, 0, 1, { group: "Layout", random: false }),
    f("cellY", "Position in floor", 0.1, 0, 1, { group: "Layout", random: false }),
    e("orientation", "String direction", "horizontal", [
      ["horizontal", "Horizontal (ledges)"],
      ["vertical", "Vertical (mullions)"],
    ], { group: "Layout" }),
    f("spacing", "String spacing", 6, 1.5, 60, { group: "Layout", unit: "px@1k", random: false }),
    b("corners", "Beacons on corners only", true, { group: "Layout" }),

    f("size", "Point size", 1.1, 0.3, 8, { group: "Light", unit: "px@1k", random: 0.1 }),
    c("color", "Colour", "#ffd7a3", { group: "Light", random: 0.03 }),
    c("coolColor", "Second colour", "#cfe1ff", { group: "Light", random: 0.03 }),
    f("colorVar", "Colour mix", 0.35, 0, 1, { group: "Light", random: 0.1 }),
    f("intensity", "Intensity", 6, 0, 60, { group: "Light", random: 0.1 }),
    f("brightVar", "Brightness variation", 0.6, 0, 1, { group: "Light", random: 0.1 }),
    f("halo", "Halo", 0.25, 0, 2, { group: "Light", random: 0.1 }),
    f("haloSize", "Halo size", 6, 1, 40, { group: "Light", unit: "× point", random: 0.1 }),

    f("twinkle", "Twinkle", 0.15, 0, 1, { group: "Animation", random: 0.1 }),
    f("rate", "Rate", 0.3, 0.02, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("duty", "Beacon on-time", 0.12, 0.02, 1, { group: "Animation", random: false }),
  ],
};
