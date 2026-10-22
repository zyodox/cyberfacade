import type { Renderer } from "./types";
import { WebGPURenderer } from "./webgpu/WebGPURenderer";

export type { Renderer } from "./types";

/**
 * Backend selection point. A native GPU backend (e.g. wgpu behind Tauri
 * commands, reusing the same WGSL) would be chosen here without touching the
 * procedural, preset or UI layers.
 */
export async function createRenderer(): Promise<Renderer> {
  return WebGPURenderer.create();
}
