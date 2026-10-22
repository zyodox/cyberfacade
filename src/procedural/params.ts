/**
 * Parameter schema shared by generators, presets, UI and every render backend.
 *
 * Layout contract: each parameter occupies one 16-byte slot (vec4<f32>) in the
 * layer uniform block, in declaration order. Scalars live in `.x`, colors in
 * `.xyz` (linear RGB). Backends generate their shader-side struct from this
 * schema, so adding a parameter never requires hand-editing a layout.
 */

export type ParamValue = number | boolean | string;

interface ParamBase {
  key: string;
  label: string;
  /** UI grouping inside a layer panel. */
  group?: string;
  hint?: string;
  /**
   * Randomization behaviour. A number is the jitter amount as a fraction of the
   * parameter range applied around the current value (keeps a preset's identity).
   * `false` excludes the parameter from RANDOMIZE.
   */
  random?: number | false;
}

export interface FloatParam extends ParamBase {
  type: "float";
  min: number;
  max: number;
  step?: number;
  default: number;
  unit?: string;
}

export interface IntParam extends ParamBase {
  type: "int";
  min: number;
  max: number;
  default: number;
}

export interface ColorParam extends ParamBase {
  type: "color";
  /** sRGB hex, e.g. "#ffc68a". Converted to linear when packed. */
  default: string;
}

export interface EnumParam extends ParamBase {
  type: "enum";
  options: { id: string; label: string }[];
  default: string;
}

export interface BoolParam extends ParamBase {
  type: "bool";
  default: boolean;
}

export interface TextParam extends ParamBase {
  type: "text";
  default: string;
  multiline?: boolean;
}

/** Imported file reference (asset id, "" = none). Packs 1 into its slot when set. */
export interface AssetParam extends ParamBase {
  type: "asset";
  accept: ("image" | "video")[];
  default: string;
}

/** Font family: a system family name or "asset:<id>" for an imported font. */
export interface FontParam extends ParamBase {
  type: "font";
  default: string;
}

export type ParamDef = FloatParam | IntParam | ColorParam | EnumParam | BoolParam | TextParam | AssetParam | FontParam;

// ---------------------------------------------------------------------------
// Value helpers

export function clampParam(def: ParamDef, value: ParamValue | undefined): ParamValue {
  switch (def.type) {
    case "float": {
      const v = typeof value === "number" && Number.isFinite(value) ? value : def.default;
      return Math.min(def.max, Math.max(def.min, v));
    }
    case "int": {
      const v = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : def.default;
      return Math.min(def.max, Math.max(def.min, v));
    }
    case "color":
      return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : def.default;
    case "enum":
      return typeof value === "string" && def.options.some((o) => o.id === value) ? value : def.default;
    case "bool":
      return typeof value === "boolean" ? value : def.default;
    case "text":
      return typeof value === "string" ? value.slice(0, 6000) : def.default;
    case "asset":
    case "font":
      return typeof value === "string" ? value : def.default;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Writes a parameter into its 4-float slot. */
export function packParam(def: ParamDef, value: ParamValue, out: Float32Array, offset: number): void {
  switch (def.type) {
    case "float":
    case "int":
      out[offset] = value as number;
      break;
    case "bool":
      out[offset] = value ? 1 : 0;
      break;
    case "enum":
      out[offset] = Math.max(0, def.options.findIndex((o) => o.id === value));
      break;
    case "color": {
      const [r, g, b] = hexToRgb(value as string);
      out[offset] = srgbToLinear(r);
      out[offset + 1] = srgbToLinear(g);
      out[offset + 2] = srgbToLinear(b);
      break;
    }
    case "asset":
      out[offset] = value ? 1 : 0;
      break;
    case "text":
    case "font":
      break;
  }
}

// ---------------------------------------------------------------------------
// Terse schema builders (keeps generator definitions readable)

type Extra = Partial<Pick<ParamBase, "group" | "hint" | "random">>;

export const f = (key: string, label: string, def: number, min: number, max: number, extra: Extra & { step?: number; unit?: string } = {}): FloatParam => ({
  type: "float",
  key,
  label,
  default: def,
  min,
  max,
  ...extra,
});

export const i = (key: string, label: string, def: number, min: number, max: number, extra: Extra = {}): IntParam => ({
  type: "int",
  key,
  label,
  default: def,
  min,
  max,
  ...extra,
});

export const c = (key: string, label: string, def: string, extra: Extra = {}): ColorParam => ({
  type: "color",
  key,
  label,
  default: def,
  ...extra,
});

export const e = (key: string, label: string, def: string, options: [string, string][], extra: Extra = {}): EnumParam => ({
  type: "enum",
  key,
  label,
  default: def,
  options: options.map(([id, label]) => ({ id, label })),
  random: false,
  ...extra,
});

export const b = (key: string, label: string, def: boolean, extra: Extra = {}): BoolParam => ({
  type: "bool",
  key,
  label,
  default: def,
  random: false,
  ...extra,
});

export const txt = (key: string, label: string, def: string, extra: Extra & { multiline?: boolean } = {}): TextParam => ({
  type: "text",
  key,
  label,
  default: def,
  random: false,
  ...extra,
});

export const asset = (key: string, label: string, accept: AssetParam["accept"], extra: Extra = {}): AssetParam => ({
  type: "asset",
  key,
  label,
  accept,
  default: "",
  random: false,
  ...extra,
});

export const font = (key: string, label: string, def: string, extra: Extra = {}): FontParam => ({
  type: "font",
  key,
  label,
  default: def,
  random: false,
  ...extra,
});
