import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Concrete: a brutalist surface (formwork panels, joints, tie holes,
 * board grain, rain stains, floor ledges) with its night lighting baked in —
 * faint sky and city glow, small wall fixtures washing the surface in pools of
 * light, and light spilled from signs, screens and windows onto the concrete.
 * Default blend "Behind": it fills only what the other layers leave empty, so
 * it can sit at the end of the stack and still see (and be lit by) everything.
 */
export const concreteGenerator: GeneratorDef = {
  id: "concrete",
  label: "Concrete",
  kind: "generator",
  description: "Brutalist concrete lit by small fixtures and by spill from signs — fills behind everything else.",
  defaultBlend: "behind",
  blurredPrev: true,
  params: [
    c("albedo", "Concrete colour", "#8c8a84", { group: "Surface", random: 0.03 }),
    f("variation", "Panel tone variation", 0.35, 0, 1, { group: "Surface", random: 0.1 }),
    i("panelsX", "Panels per bay", 1, 1, 8, { group: "Surface", random: false }),
    i("panelsY", "Panels per floor", 1, 1, 6, { group: "Surface", random: false }),
    f("joint", "Joint width", 1.4, 0, 8, { group: "Surface", unit: "px@1k", random: false }),
    f("jointDepth", "Joint shadow", 0.6, 0, 1, { group: "Surface", random: 0.1 }),
    i("tieHoles", "Tie holes", 3, 0, 8, { group: "Surface", random: false }),
    f("grain", "Board-form grain", 0.3, 0, 1, { group: "Surface", random: 0.1 }),
    f("stains", "Rain stains", 0.45, 0, 1, { group: "Surface", random: 0.1 }),
    f("ledges", "Floor ledges", 0.5, 0, 1, { group: "Surface", random: 0.1 }),

    f("ambient", "Sky light", 0.006, 0, 0.1, { group: "Ambient", random: 0.1 }),
    c("skyColor", "Sky colour", "#5a6ea8", { group: "Ambient", random: 0.03 }),
    f("cityGlow", "City glow", 0.012, 0, 0.2, { group: "Ambient", hint: "Street light bouncing up the lower floors", random: 0.1 }),
    c("cityColor", "City glow colour", "#ff9d66", { group: "Ambient", random: 0.03 }),
    f("spill", "Spill from signs", 1, 0, 8, { group: "Ambient", hint: "Light from signs, screens and windows (layers listed before this one) washing onto the concrete", random: 0.1 }),
    f("spillRadius", "Spill radius", 50, 4, 300, { group: "Ambient", unit: "px@1k", random: 0.1 }),

    e("fixture", "Fixtures", "uplight", [
      ["none", "None"],
      ["uplight", "Uplights (grazing up)"],
      ["downlight", "Downlights"],
      ["both", "Up + down"],
      ["sconce", "Small sconces"],
      ["ledge", "Ledge washers"],
    ], { group: "Fixtures" }),
    i("fixEveryX", "Every … bays", 2, 1, 32, { group: "Fixtures", random: false }),
    i("fixEveryY", "Every … floors", 3, 1, 60, { group: "Fixtures", random: false }),
    f("fixOffsetY", "Height in floor", 0.08, 0, 1, { group: "Fixtures", random: false }),
    f("beam", "Beam spread", 0.28, 0.02, 1.5, { group: "Fixtures", random: 0.1 }),
    f("reach", "Reach", 1.6, 0.1, 10, { group: "Fixtures", unit: "floors", random: 0.1 }),
    f("fixKelvin", "Colour temperature", 3000, 1800, 12000, { group: "Fixtures", unit: "K", random: 0.05 }),
    c("fixTint", "Tint", "#ffffff", { group: "Fixtures", random: false }),
    f("fixIntensity", "Intensity", 2.5, 0, 40, { group: "Fixtures", random: 0.1 }),
    f("fixDensity", "Fixtures lit", 1, 0, 1, { group: "Fixtures", random: 0.1 }),
    f("fixFlicker", "Faulty fixtures", 0.04, 0, 1, { group: "Fixtures", random: 0.1 }),
    f("lampSize", "Lamp size", 1.6, 0, 10, { group: "Fixtures", unit: "px@1k", random: 0.1 }),
  ],
};
