import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Realistic lit windows aligned to the architecture grid: per-unit occupancy,
 * floor/zone correlation, color temperature, interior shading (ceiling light,
 * office fixtures, blinds, curtains, furniture) and seamless occupancy/TV/flicker
 * animation.
 */
export const windowsGenerator: GeneratorDef = {
  id: "windows",
  label: "Windows",
  kind: "generator",
  description: "Architectural windows with realistic night occupancy.",
  defaultBlend: "add",
  params: [
    f("winWidth", "Window width", 0.8, 0.1, 1, { group: "Geometry", hint: "Fraction of the clear bay opening", random: 0.08 }),
    f("winHeight", "Window height", 0.75, 0.1, 1, { group: "Geometry", hint: "Fraction of the clear floor opening", random: 0.08 }),
    f("sillAlign", "Vertical align", 0.4, 0, 1, { group: "Geometry", hint: "0 = sits on slab, 1 = hangs from ceiling", random: 0.1 }),
    i("panes", "Panes", 2, 1, 4, { group: "Geometry", random: false }),
    f("frame", "Frame", 0.035, 0, 0.2, { group: "Geometry", random: 0.05 }),
    i("unitWidth", "Unit width", 1, 1, 6, { group: "Geometry", hint: "Windows per apartment/office unit sharing one light state", random: false }),

    e("lightMode", "Lights", "occupancy", [["occupancy", "By occupancy"], ["all", "All on"], ["none", "All off"]], { group: "Occupancy", hint: "Switching (Animation) still flips rooms on top of this; Switch rate 0 = steady" }),
    f("occupancy", "Occupancy", 0.45, 0, 1, { group: "Occupancy", random: 0.12 }),
    f("floorBias", "Floor correlation", 0.2, 0, 1, { group: "Occupancy", hint: "Whole floors lit together (offices)", random: 0.15 }),
    f("clustering", "Clustering", 0.3, 0, 1, { group: "Occupancy", hint: "Occupied zones instead of salt-and-pepper", random: 0.15 }),
    f("clusterScale", "Cluster scale", 4, 1, 16, { group: "Occupancy", random: 0.1 }),
    f("heightBias", "Height bias", 0, -1, 1, { group: "Occupancy", hint: "Negative = lower floors busier", random: 0.1 }),
    f("roomVariation", "Room variation", 0.3, 0, 1, { group: "Occupancy", hint: "Individual rooms dark inside lit units", random: 0.1 }),

    c("warmColor", "Warm light", "#ffc58f", { group: "Light", random: 0.04 }),
    c("coolColor", "Cool light", "#dfe9ff", { group: "Light", random: 0.04 }),
    f("coolRatio", "Cool ratio", 0.2, 0, 1, { group: "Light", random: 0.12 }),
    f("tempVariation", "Tint variation", 0.35, 0, 1, { group: "Light", random: 0.12 }),
    f("intensity", "Intensity", 1.5, 0, 16, { group: "Light", random: 0.05 }),
    f("brightnessVar", "Brightness variation", 0.4, 0, 1, { group: "Light", random: 0.1 }),
    f("spill", "Spill light", 0.25, 0, 1, { group: "Light", hint: "Dim light from corridors behind unlit windows", random: 0.1 }),
    f("unlit", "Glass reflection", 0.03, 0, 0.5, { group: "Light", random: 0.05 }),
    c("unlitColor", "Reflection tint", "#34445f", { group: "Light", random: 0.04 }),

    f("ceiling", "Ceiling light", 0.6, 0, 1, { group: "Interior", random: 0.12 }),
    f("lamps", "Lamp-lit rooms", 0.3, 0, 1, { group: "Interior", hint: "Rooms lit by floor/table lamps instead of ceiling light", random: 0.12 }),
    f("fixtures", "Office fixtures", 0, 0, 1, { group: "Interior", random: 0.1 }),
    f("fixtureCount", "Fixtures per bay", 2, 1, 6, { group: "Interior", step: 1, random: false }),
    f("blinds", "Blinds", 0.25, 0, 1, { group: "Interior", random: 0.12 }),
    f("curtains", "Curtains", 0.3, 0, 1, { group: "Interior", random: 0.12 }),
    f("furniture", "Furniture", 0.3, 0, 1, { group: "Interior", random: 0.12 }),

    f("toggleRate", "Switch rate", 0.1, 0, 1, { group: "Animation", unit: "Hz", hint: "Max on/off events per second per unit. 0 = steady: rooms keep their Lights / Occupancy state", random: 0.1 }),
    f("toggleAmount", "Switching units", 0.15, 0, 1, { group: "Animation", random: 0.1 }),
    f("tvRatio", "TV flicker", 0.08, 0, 1, { group: "Animation", random: 0.1 }),
    c("tvColor", "TV color", "#7fa8ff", { group: "Animation", random: 0.04 }),
    f("flicker", "Faulty tubes", 0, 0, 1, { group: "Animation", random: 0.08 }),
  ],
};
