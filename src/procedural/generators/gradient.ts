import { b, c, e, f } from "../params";
import type { GeneratorDef } from "../types";

/** Linear / radial / diamond / angular three-stop gradients with seamless scrolling and hue cycling. */
export const gradientGenerator: GeneratorDef = {
  id: "gradient",
  label: "Gradient",
  kind: "color",
  description: "Scrolling multi-stop gradient; emitter or modulator, snappable to windows.",
  defaultBlend: "add",
  params: [
    e("gtype", "Type", "linear", [["linear", "Linear"], ["radial", "Radial"], ["diamond", "Diamond"], ["angular", "Angular"]], { group: "Shape" }),
    f("angle", "Angle", 90, 0, 360, { group: "Shape", unit: "°", hint: "90 = bottom → top", random: false }),
    f("centerX", "Center X", 0.5, 0, 1, { group: "Shape", random: false }),
    f("centerY", "Center Y", 0.5, 0, 1, { group: "Shape", random: false }),
    f("repeat", "Repeats", 1, 0.25, 16, { group: "Shape", random: 0.1 }),
    e("wrap", "Wrap", "mirror", [["clamp", "Clamp"], ["repeat", "Repeat"], ["mirror", "Mirror"]], { group: "Shape" }),
    e("quantize", "Snap to", "none", [["none", "Free"], ["cells", "Windows"], ["floors", "Floors"], ["bays", "Bays"]], { group: "Shape" }),

    c("colorA", "Color A", "#ff3d7f", { group: "Colors", random: 0.05 }),
    c("colorB", "Color B", "#7a5cff", { group: "Colors", random: 0.05 }),
    c("colorC", "Color C", "#19d3ff", { group: "Colors", random: 0.05 }),
    b("useC", "Use color C", true, { group: "Colors" }),
    f("midpoint", "Midpoint", 0.5, 0.05, 0.95, { group: "Colors", random: 0.1 }),
    f("intensity", "Intensity", 2, 0, 30, { group: "Colors", random: 0.06 }),

    f("scroll", "Scroll rate", 0.1, 0, 4, { group: "Animation", unit: "Hz", random: 0.1 }),
    b("reverse", "Reverse", false, { group: "Animation" }),
    f("hueCycle", "Hue cycle", 0, 0, 2, { group: "Animation", unit: "Hz", random: 0.1 }),

    e("output", "Output", "emit", [["emit", "Emit color"], ["modulate", "Modulate (multiply)"]], { group: "Output" }),
    f("amount", "Modulation depth", 1, 0, 1, { group: "Output", random: 0.1 }),
  ],
};
