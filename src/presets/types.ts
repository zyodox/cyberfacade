import type { ParamValue } from "../procedural/params";
import type { AnimationSettings, Architecture, AudioRoute, BlendMode, LayerRegion, LayerRegionX, LayerTimeShift, LookSettings, OutputSettings } from "../procedural/types";

export const PRESET_CATEGORIES = [
  "Realistic Buildings",
  "Residential",
  "Corporate",
  "Luxury/Futuristic",
  "LED Media Facades",
  "Chinese/Asian Megacity",
  "Cyberpunk",
  "Noir Brutalist",
  "Neon",
  "Industrial",
  "Sci-Fi",
  "Minimal/Soft Club",
  "Living Light",
  "Kinetic Type",
  "Ad Screens",
  "Glitch",
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export interface PresetLayer {
  id: string;
  generator: string;
  name?: string;
  enabled?: boolean;
  blend?: BlendMode;
  opacity?: number;
  clip?: boolean;
  region?: Partial<LayerRegion>;
  regionX?: Partial<LayerRegionX>;
  timeShift?: Partial<LayerTimeShift>;
  params?: Record<string, ParamValue>;
}

/**
 * A preset is pure data: a layer stack of generator instances plus
 * architecture, animation and look defaults. The same schema is used for built-in and user
 * presets, so hundreds of presets need no new code.
 */
export interface PresetDef {
  schema: 1;
  id: string;
  name: string;
  category: PresetCategory;
  tags?: string[];
  description?: string;
  seed?: number;
  architecture?: Partial<Architecture>;
  animation?: Partial<AnimationSettings>;
  look?: Partial<LookSettings>;
  output?: Partial<OutputSettings>;
  layers: PresetLayer[];
  /** Optional audio-reactive routes. */
  audio?: { routes: AudioRoute[] };
  /** Explicit randomize ranges keyed "layerId.param" or "arch.key"; overrides schema jitter. */
  randomize?: Record<string, [number, number]>;
  /** Marks presets created by the user (stored locally). */
  user?: boolean;
}
