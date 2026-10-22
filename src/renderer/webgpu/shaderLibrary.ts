/**
 * WGSL assembly for the WebGPU backend. Generator shaders are plain WGSL files
 * keyed by generator id; a native wgpu backend can consume the same files.
 */
import commonWgsl from "../../shaders/common.wgsl?raw";
import layerPassWgsl from "../../shaders/layer_pass.wgsl?raw";
import presentWgsl from "../../shaders/present.wgsl?raw";
import tonemapWgsl from "../../shaders/tonemap.wgsl?raw";
import scene3dWgsl from "../../shaders/scene3d.wgsl?raw";
import postWgsl from "../../shaders/post.wgsl?raw";
import windowsWgsl from "../../shaders/generators/windows.wgsl?raw";
import stripesWgsl from "../../shaders/generators/stripes.wgsl?raw";
import gridWgsl from "../../shaders/generators/grid.wgsl?raw";
import noiseWgsl from "../../shaders/generators/noise.wgsl?raw";
import voronoiWgsl from "../../shaders/generators/voronoi.wgsl?raw";
import blocksWgsl from "../../shaders/generators/blocks.wgsl?raw";
import gradientWgsl from "../../shaders/generators/gradient.wgsl?raw";
import shapesWgsl from "../../shaders/generators/shapes.wgsl?raw";
import thresholdWgsl from "../../shaders/generators/threshold.wgsl?raw";
import blurWgsl from "../../shaders/generators/blur.wgsl?raw";
import distortWgsl from "../../shaders/generators/distort.wgsl?raw";
import colorWgsl from "../../shaders/generators/color.wgsl?raw";
import flickerWgsl from "../../shaders/generators/flicker.wgsl?raw";
import waveWgsl from "../../shaders/generators/wave.wgsl?raw";
import interiorsWgsl from "../../shaders/generators/interiors.wgsl?raw";
import glassWgsl from "../../shaders/generators/glass.wgsl?raw";
import mediaWgsl from "../../shaders/generators/media.wgsl?raw";
import signWgsl from "../../shaders/generators/sign.wgsl?raw";
import concreteWgsl from "../../shaders/generators/concrete.wgsl?raw";
import lightsWgsl from "../../shaders/generators/lights.wgsl?raw";
import ledmeshWgsl from "../../shaders/generators/ledmesh.wgsl?raw";
import particlesWgsl from "../../shaders/generators/particles.wgsl?raw";
import livingWgsl from "../../shaders/generators/living.wgsl?raw";
import logoWgsl from "../../shaders/generators/logo.wgsl?raw";
import hudWgsl from "../../shaders/generators/hud.wgsl?raw";
import photoLightsWgsl from "../../shaders/generators/photolights.wgsl?raw";
import type { GeneratorDef } from "../../procedural/types";

const generatorSources: Record<string, string> = {
  windows: windowsWgsl,
  stripes: stripesWgsl,
  grid: gridWgsl,
  noise: noiseWgsl,
  voronoi: voronoiWgsl,
  blocks: blocksWgsl,
  gradient: gradientWgsl,
  shapes: shapesWgsl,
  threshold: thresholdWgsl,
  blur: blurWgsl,
  distort: distortWgsl,
  color: colorWgsl,
  flicker: flickerWgsl,
  wave: waveWgsl,
  interiors: interiorsWgsl,
  glass: glassWgsl,
  media: mediaWgsl,
  sign: signWgsl,
  concrete: concreteWgsl,
  lights: lightsWgsl,
  ledmesh: ledmeshWgsl,
  particles: particlesWgsl,
  living: livingWgsl,
  logo: logoWgsl,
  hud: hudWgsl,
  photolights: photoLightsWgsl,
};

export function hasGeneratorShader(id: string): boolean {
  return id in generatorSources;
}

// WGSL reserved words most likely to collide with parameter names.
const WGSL_RESERVED = new Set(
  "type typedef filter set get match pass target smooth shared patch move mod module self super this new null nil use using where with yield static enum export import interface layout macro meta package private public ref register resource restrict sample sizeof template throw try union unless volatile async await become cast catch class common compile const_cast crate do extends extern final finally friend from impl inline instanceof mutable namespace operator precise precision premerge protected pub readonly require unsafe virtual writeonly".split(
    " ",
  ),
);

/** Builds the Params struct from the schema (one vec4 slot per parameter). */
export function paramsStruct(def: GeneratorDef): string {
  const bad = def.params.filter((p) => WGSL_RESERVED.has(p.key)).map((p) => p.key);
  if (bad.length) throw new Error(`Generator "${def.id}" uses WGSL reserved word(s) as parameter keys: ${bad.join(", ")}`);
  const dyn = Array.from({ length: def.dynamic?.slots ?? 0 }, (_, k) => `  dyn${k}: vec4f,`);
  const fields = ["  base0: vec4f,", "  base1: vec4f,", "  base2: vec4f,", "  base3: vec4f,", ...def.params.map((p) => `  ${p.key}: vec4f,`), ...dyn];
  return `struct Params {\n${fields.join("\n")}\n}\n@group(1) @binding(0) var<uniform> P: Params;\n`;
}

export function assembleLayerShader(def: GeneratorDef): string {
  const src = generatorSources[def.id];
  if (!src) throw new Error(`No WGSL source registered for generator "${def.id}"`);
  return [commonWgsl, paramsStruct(def), src, layerPassWgsl].join("\n");
}

export const presentShader = [tonemapWgsl, presentWgsl].join("\n");
export const scene3dShader = scene3dWgsl;
export const postShader = [tonemapWgsl, postWgsl].join("\n");
