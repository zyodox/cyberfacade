import { resolveFontFamily } from "../../assets/assets";
import { b, c, e, f, font, txt } from "../params";
import type { GeneratorDef, LayerInstance, MediaRef, TextSpec } from "../types";

const WEIGHTS: Record<string, number> = { light: 300, regular: 400, bold: 700 };

function hudTextSpec(layer: LayerInstance): TextSpec {
  const p = layer.params;
  const lines = String(p.text ?? "").split("\n").slice(0, 3);
  return {
    // Empty lines keep their message slot (a zero-width letter is not blank).
    text: lines.map((l) => (l.trim() ? l : "​")).join("\n"),
    family: resolveFontFamily(String(p.font ?? "")),
    weight: WEIGHTS[p.weight as string] ?? 400,
    vertical: false,
    spacing: 0.12,
    stroke: 0,
    lineHeight: 1.2,
    messages: true,
    charset: "0123456789ABCDEF:/.-#",
  };
}

/**
 * HUD Frame: the in-world interface garnish around an ad — corner brackets,
 * dashed frame, rulers, reticle, barcode, scrolling data columns, a typed
 * label, progress / level meters, scan line, chevrons and a callout. Place it
 * over a screen or sign; everything builds on in turn each cycle.
 */
export const hudGenerator: GeneratorDef = {
  id: "hud",
  label: "HUD Frame",
  kind: "generator",
  description: "Interface garnish: brackets, rulers, reticle, barcode, data columns, typed labels, meters.",
  defaultBlend: "add",
  params: [
    f("posX", "Centre X", 0.5, -0.5, 1.5, { group: "Placement", random: false }),
    f("posY", "Centre Y", 0.5, -0.5, 1.5, { group: "Placement", random: false, hint: "0 = bottom, 1 = top" }),
    f("sizeW", "Width", 0.7, 0.02, 2, { group: "Placement", random: false }),
    f("sizeH", "Height", 0.35, 0.02, 2, { group: "Placement", random: false }),

    txt("text", "Label", "VOLTA COLA\nNEAREST VENDOR 120M\nLIMITED", { group: "Text", multiline: true, hint: "Line 1 label, line 2 sub-label, line 3 callout text" }),
    font("font", "Font", "Segoe UI", { group: "Text" }),
    e("weight", "Weight", "bold", [
      ["light", "Light"],
      ["regular", "Regular"],
      ["bold", "Bold"],
    ], { group: "Text" }),
    f("labelSize", "Label size", 0.1, 0.02, 0.4, { group: "Text", hint: "Fraction of the frame height", random: false }),
    f("dataSize", "Data glyph size", 0.035, 0.01, 0.2, { group: "Text", random: false }),

    b("corners", "Corner brackets", true, { group: "Elements" }),
    b("frame", "Dashed frame", true, { group: "Elements" }),
    b("ticks", "Rulers", true, { group: "Elements" }),
    b("crosshair", "Reticle", false, { group: "Elements" }),
    f("reticleX", "Reticle X", 0.72, 0, 1, { group: "Elements", random: false }),
    f("reticleY", "Reticle Y", 0.5, 0, 1, { group: "Elements", random: false }),
    b("barcode", "Barcode", true, { group: "Elements" }),
    b("label", "Label", true, { group: "Elements" }),
    b("data", "Data columns", true, { group: "Elements" }),
    b("progress", "Progress bar", true, { group: "Elements" }),
    b("meter", "Level meter", false, { group: "Elements" }),
    b("chevrons", "Chevrons", false, { group: "Elements" }),
    b("callout", "Callout leader", false, { group: "Elements" }),
    b("scan", "Scan line", false, { group: "Elements" }),

    c("color", "Line colour", "#e9f3ff", { group: "Look", random: 0.03 }),
    c("accent", "Accent colour", "#ffd23a", { group: "Look", random: 0.03 }),
    f("intensity", "Intensity", 2.5, 0, 30, { group: "Look", random: 0.05 }),
    f("lineWidth", "Line width", 1.4, 0.3, 12, { group: "Look", unit: "px@1k", random: false }),
    f("cornerLen", "Bracket length", 0.14, 0.02, 0.5, { group: "Look", random: false }),
    f("glow", "Glow", 0.5, 0, 3, { group: "Look", random: 0.05 }),

    b("build", "Build on / blink out", true, { group: "Animation" }),
    f("rate", "Cycle rate", 0.12, 0.02, 2, { group: "Animation", unit: "Hz", random: 0.1 }),
    f("dataRate", "Data rate", 6, 0.5, 30, { group: "Animation", unit: "Hz", random: 0.1 }),
  ],
  media(layer): MediaRef | null {
    const spec = hudTextSpec(layer);
    return { kind: "text", spec, key: JSON.stringify(spec) };
  },
};
