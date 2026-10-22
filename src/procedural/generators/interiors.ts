import { c, e, f, i } from "../params";
import type { GeneratorDef } from "../types";

/**
 * Interior mapping: every window looks into a real 3D room (ray-traced box
 * with ceiling, floor, side and back walls) seen from a virtual street-level
 * viewer, so rooms show correct perspective and parallax. Rooms span several
 * bays, have office or home fit-outs, furniture and walking people, and their
 * back walls can become screens that show the layers below — media inside the
 * building instead of painted on it.
 */
export const interiorsGenerator: GeneratorDef = {
  id: "interiors",
  label: "Interiors",
  kind: "generator",
  description: "3D rooms behind the glass — perspective, furniture, people, screens.",
  defaultBlend: "replace",
  params: [
    f("winWidth", "Window width", 0.92, 0.1, 1, { group: "Geometry", random: 0.05 }),
    f("winHeight", "Window height", 0.94, 0.1, 1, { group: "Geometry", random: 0.05 }),
    f("sillAlign", "Vertical align", 0, 0, 1, { group: "Geometry", random: false }),
    i("panes", "Panes", 2, 1, 4, { group: "Geometry", random: false }),
    f("frame", "Frame", 0.02, 0, 0.15, { group: "Geometry", random: 0.05 }),
    i("unitWidth", "Room width (bays)", 3, 1, 8, { group: "Geometry", hint: "Rooms span several windows — one continuous interior", random: false }),
    f("depth", "Room depth", 2.5, 0.3, 8, { group: "Geometry", hint: "In bay widths", random: 0.08 }),
    f("eyeX", "Viewer X", 0.5, -1, 2, { group: "Geometry", hint: "Where the virtual viewer stands (building widths)", random: false }),
    f("eyeY", "Viewer height", 0.3, -1, 2, { group: "Geometry", hint: "0 = street, 1 = roof", random: false }),
    f("eyeDist", "Viewer distance", 1.4, 0.2, 6, { group: "Geometry", hint: "Smaller = stronger perspective", random: 0.08 }),

    e("lightMode", "Lights", "occupancy", [["occupancy", "By lit rooms"], ["all", "All on"], ["none", "All off"]], { group: "Occupancy", hint: "Switching still flips rooms on top of this; Switch rate 0 = steady" }),
    f("occupancy", "Lit rooms", 0.55, 0, 1, { group: "Occupancy", random: 0.1 }),
    f("floorBias", "Floor correlation", 0.4, 0, 1, { group: "Occupancy", random: 0.1 }),
    f("toggleRate", "Switch rate", 0.05, 0, 1, { group: "Occupancy", unit: "Hz", random: 0.1 }),
    f("toggleAmount", "Switching rooms", 0.1, 0, 1, { group: "Occupancy", random: 0.1 }),

    f("officeRatio", "Offices", 0.5, 0, 1, { group: "Rooms", hint: "Ceiling light panels, desks", random: 0.1 }),
    f("homeRatio", "Homes", 0.3, 0, 1, { group: "Rooms", hint: "Warm lamps, sofas, art — the rest are bare rooms", random: 0.1 }),
    f("screenRatio", "Screen rooms", 0, 0, 1, { group: "Rooms", hint: "Back wall shows the layers below", random: false }),
    f("screenGain", "Screen brightness", 1, 0, 6, { group: "Rooms", random: 0.06 }),
    f("screenSpill", "Screen light spill", 0.35, 0, 1, { group: "Rooms", hint: "How much the screen lights the room", random: 0.1 }),

    c("warmColor", "Warm light", "#ffc890", { group: "Light", random: 0.04 }),
    c("coolColor", "Cool light", "#e6efff", { group: "Light", random: 0.04 }),
    f("intensity", "Intensity", 1.2, 0, 8, { group: "Light", random: 0.06 }),
    f("brightnessVar", "Brightness variation", 0.35, 0, 1, { group: "Light", random: 0.1 }),
    f("ambient", "Dark-room ambient", 0.02, 0, 0.3, { group: "Light", random: 0.05 }),

    f("furniture", "Furniture", 0.7, 0, 1, { group: "Details", random: 0.1 }),
    f("people", "People", 0.35, 0, 1, { group: "Details", random: 0.1 }),
    f("peopleMotion", "People motion", 0.05, 0, 1, { group: "Details", unit: "Hz", random: 0.1 }),
    f("blinds", "Blinds", 0.15, 0, 1, { group: "Details", random: 0.1 }),
    f("artwork", "Art & doors", 0.5, 0, 1, { group: "Details", random: 0.1 }),

    f("reflection", "Glass reflection", 0.05, 0, 0.5, { group: "Glass", random: 0.05 }),
    c("reflectColor", "Reflection tint", "#3a4a66", { group: "Glass", random: 0.04 }),
  ],
};
