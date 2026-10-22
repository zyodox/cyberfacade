import type { ParamDef, ParamValue } from "./params";

/** `behind` composites the layer underneath everything already in the stack (fills empty areas only). */
export const BLEND_MODES = ["normal", "add", "multiply", "screen", "max", "mask", "replace", "subtract", "behind"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const SYMMETRY_MODES = ["none", "mirror", "repeat", "mirror-repeat"] as const;
export type SymmetryMode = (typeof SYMMETRY_MODES)[number];

export const TONEMAPS = ["agx", "agx-punchy", "aces", "clamp"] as const;
export type Tonemap = (typeof TONEMAPS)[number];

/**
 * The building-aware coordinate system every generator shares.
 * Texture U wraps around `facades` faces; V runs bottom (0) to top (1).
 */
export interface Architecture {
  floors: number;
  /** Window bays per facade. */
  bays: number;
  /** How many building faces the texture spans horizontally (1 = one face, 4 = full wrap). */
  facades: number;
  /** Floor slab / spandrel height as a fraction of floor height. */
  slab: number;
  /** Mullion width as a fraction of bay width. */
  mullion: number;
  symmetry: SymmetryMode;
}

export interface LayerRegion {
  /** Building-height range (0 = bottom, 1 = top) the layer affects. */
  min: number;
  max: number;
  soft: number;
  invert: boolean;
}

export interface LayerRegionX {
  /** Horizontal range (0 = left edge of the texture, 1 = right edge). */
  min: number;
  max: number;
  soft: number;
}

/**
 * Time displacement: the layer's animation phase is offset across the building
 * (slit-scan). Offsets are phase shifts, so loops stay seamless.
 */
export interface LayerTimeShift {
  /** Phase offset from bottom to top (in loops). */
  y: number;
  /** Phase offset from left to right (in loops). */
  x: number;
  /** Step the offset per floor / bay instead of continuously. */
  quantize: boolean;
}

export interface LayerInstance {
  id: string;
  generator: string;
  name: string;
  enabled: boolean;
  blend: BlendMode;
  opacity: number;
  /** Restrict the layer to the coverage (alpha) of everything below it. */
  clip: boolean;
  region: LayerRegion;
  regionX: LayerRegionX;
  timeShift: LayerTimeShift;
  params: Record<string, ParamValue>;
}

export const DEFAULT_REGION_X: LayerRegionX = { min: 0, max: 1, soft: 0 };
export const DEFAULT_TIME_SHIFT: LayerTimeShift = { y: 0, x: 0, quantize: false };

export interface AnimationSettings {
  /** Loop length in seconds (2–15). */
  duration: number;
  /** Global rate multiplier; rates are still quantized to whole cycles per loop. */
  speed: number;
}

export interface LookSettings {
  /** Global emission multiplier baked into the output. */
  emission: number;
  /** Preview/Color-channel exposure in stops. */
  exposure: number;
  tonemap: Tonemap;
}

export interface OutputSettings {
  width: number;
  height: number;
}

export const AUDIO_BANDS = ["bass", "mid", "high", "level"] as const;
export type AudioBand = (typeof AUDIO_BANDS)[number];

/**
 * Audio modulation route. `target` is "look.emission", "<layerId>.opacity" or
 * "<layerId>.<paramKey>" (numeric parameters). `amount` is a fraction of the
 * parameter's range added at full band level (negative = inverse).
 */
export interface AudioRoute {
  id: string;
  band: AudioBand;
  target: string;
  amount: number;
}

/** The complete, serializable description of one facade texture. */
export interface FacadeDocument {
  name: string;
  presetId: string | null;
  seed: number;
  architecture: Architecture;
  animation: AnimationSettings;
  look: LookSettings;
  output: OutputSettings;
  layers: LayerInstance[];
  audio: { routes: AudioRoute[] };
}

export type GeneratorKind = "generator" | "mask" | "modifier" | "animation" | "color" | "emission";

/** Backend-agnostic description of a procedural layer type. */
export interface GeneratorDef {
  id: string;
  label: string;
  kind: GeneratorKind;
  description: string;
  defaultBlend: BlendMode;
  params: ParamDef[];
  /** Extra per-instance values packed into the reserved uniform floats (P.base2.w, P.base3.w). */
  extra?(layer: LayerInstance): [number, number];
  /**
   * The layer reads a mipmapped copy of everything composited before it as
   * mediaTex (wide soft light: spill, bounce) instead of an external texture.
   */
  blurredPrev?: boolean;
  /** External texture the layer samples (image, video frame, rasterized text), bound as mediaTex. */
  media?(layer: LayerInstance, ctx: MediaContext): MediaRef | null;
  /**
   * Instanced sprites: before the layer pass, `count` quads are drawn with the
   * shader's vs_particle / fs_particle into a scratch target (media = sprite),
   * which the layer pass then reads as mediaTex.
   */
  particles?(layer: LayerInstance): { count: number; over: boolean };
  /**
   * Per-frame values computed on the CPU (playlist slot and transition…),
   * written after the parameters as vec4 slots dyn0, dyn1, … of Params.
   */
  dynamic?: { slots: number; fill(layer: LayerInstance, ctx: MediaContext, out: Float32Array, offset: number): void };
}

export interface MediaContext {
  /** Normalized loop phase. */
  phase: number;
  /** Loop length in seconds. */
  duration: number;
  speed: number;
}

/** Rasterization request for text layers (see assets/textRaster.ts). */
export interface TextSpec {
  text: string;
  /** CSS family (already resolved for imported fonts). */
  family: string;
  weight: number;
  vertical: boolean;
  /** Letter spacing in em. */
  spacing: number;
  /** Outline stroke width in em (0 = none). */
  stroke: number;
  /** Line height in em (multi-line text). */
  lineHeight: number;
  /** Every line is a separate message (rotating billboard text). */
  messages?: boolean;
  /** Glyphs used for scramble / split-flap / glitch letters ("" = none). */
  charset?: string;
}

export type MediaRef =
  | { kind: "image"; assetId: string }
  | { kind: "video"; assetId: string; time: number; rate: number }
  | { kind: "text"; spec: TextSpec; key: string }
  /** Two textures at once (mediaTex, mediaTex2): the outgoing and incoming item of a playlist. */
  | { kind: "pair"; a: SingleMediaRef; b: SingleMediaRef | null }
  /** Vector logo: colour render (mediaTex) + stroke / draw-order data (mediaTex2). */
  | { kind: "logo"; assetId: string; stroke: number; key: string };

export type SingleMediaRef =
  | { kind: "image"; assetId: string }
  | { kind: "video"; assetId: string; time: number; rate: number; tag?: string }
  | { kind: "text"; spec: TextSpec; key: string };

export const DEFAULT_REGION: LayerRegion = { min: 0, max: 1, soft: 0, invert: false };

export const DEFAULT_ARCHITECTURE: Architecture = {
  floors: 32,
  bays: 10,
  facades: 1,
  slab: 0.18,
  mullion: 0.08,
  symmetry: "none",
};
