import type { GeneratorDef } from "./types";
import { windowsGenerator } from "./generators/windows";
import { stripesGenerator } from "./generators/stripes";
import { gridGenerator } from "./generators/grid";
import { noiseGenerator } from "./generators/noise";
import { voronoiGenerator } from "./generators/voronoi";
import { blocksGenerator } from "./generators/blocks";
import { gradientGenerator } from "./generators/gradient";
import { shapesGenerator } from "./generators/shapes";
import { interiorsGenerator } from "./generators/interiors";
import { glassGenerator } from "./generators/glass";
import { blurGenerator, colorGenerator, distortGenerator, flickerGenerator, thresholdGenerator, waveGenerator } from "./generators/modifiers";
import { mediaGenerator } from "./generators/media";
import { signGenerator } from "./generators/sign";
import { concreteGenerator } from "./generators/concrete";
import { lightsGenerator } from "./generators/lights";
import { ledmeshGenerator } from "./generators/ledmesh";
import { particlesGenerator } from "./generators/particles";
import { livingGenerator } from "./generators/living";
import { logoGenerator } from "./generators/logo";
import { hudGenerator } from "./generators/hud";
import { photoLightsGenerator } from "./generators/photolights";

const generators = new Map<string, GeneratorDef>();

export function registerGenerator(def: GeneratorDef): void {
  generators.set(def.id, def);
}

export function getGenerator(id: string): GeneratorDef | undefined {
  return generators.get(id);
}

export function listGenerators(): GeneratorDef[] {
  return [...generators.values()];
}

[
  concreteGenerator,
  windowsGenerator,
  interiorsGenerator,
  lightsGenerator,
  mediaGenerator,
  signGenerator,
  logoGenerator,
  hudGenerator,
  particlesGenerator,
  livingGenerator,
  ledmeshGenerator,
  stripesGenerator,
  gridGenerator,
  blocksGenerator,
  shapesGenerator,
  noiseGenerator,
  voronoiGenerator,
  gradientGenerator,
  waveGenerator,
  flickerGenerator,
  photoLightsGenerator,
  colorGenerator,
  thresholdGenerator,
  blurGenerator,
  distortGenerator,
  glassGenerator,
].forEach(registerGenerator);
