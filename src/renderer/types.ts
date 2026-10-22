/**
 * Renderer abstraction. The procedural/preset systems only ever produce a
 * `FrameDescription`; any backend (WebGPU today, native wgpu later — which
 * consumes the same WGSL) turns that into pixels.
 */
import type { Primitive } from "../preview3d/geometry";
import type { OrbitCamera } from "../preview3d/mat4";
import type { MediaRef, Tonemap } from "../procedural/types";

export interface LayerPass {
  /** Stable per-instance key; lets a backend keep GPU resources across frames. */
  key: string;
  generator: string;
  /** Packed per `procedural/packing.ts`. */
  uniforms: Float32Array;
  /** External texture (imported image / video frame / rasterized text). */
  media?: MediaRef;
  /** Instanced sprite pass drawn before the layer pass (see GeneratorDef.particles). */
  particles?: { count: number; over: boolean };
}

export interface RenderOptions {
  /**
   * Real-time preview: videos play continuously (drift-corrected) instead of
   * seeking frame-exactly. Offline renders call `prepare()` first.
   */
  live?: boolean;
  /** Video decoders are per (mediaSlot, layer); defaults to the render slot. */
  mediaSlot?: string;
}

export interface FrameDescription {
  width: number;
  height: number;
  /** Packed Globals block (see `packGlobals`). */
  globals: ArrayBuffer;
  layers: LayerPass[];
}

export type PreviewChannel = "color" | "emission" | "mask" | "alpha";

export interface ViewOptions {
  /** Output texture size; the rendered frame may be a lower-res proxy of it. */
  outputSize: [number, number];
  /** Canvas pixels per output-texture pixel. */
  scale: number;
  /** Texture-space UV at the canvas centre. */
  center: [number, number];
  /** Global emission multiplier (document look). */
  emission: number;
  /** Exposure in stops. */
  exposure: number;
  tonemap: Tonemap;
  channel: PreviewChannel;
  /** Repeat the texture horizontally to check seamless wrapping. */
  tile: boolean;
}

export interface RendererInfo {
  backend: string;
  adapter: string;
  maxTextureSize: number;
}

/** Opaque handle to a rendered frame living on the GPU. */
export interface FrameHandle {
  readonly width: number;
  readonly height: number;
}

export interface RenderView {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  present(frame: FrameHandle | null, opts: ViewOptions): void;
  dispose(): void;
}

export type OutputChannel = "color" | "emission" | "mask" | "alpha";

export interface ReadRequest {
  channel: OutputChannel;
  /** true → half-float RGBA (linear, unclamped); false → 8-bit RGBA (display-encoded for color). */
  hdr: boolean;
  /** Global emission multiplier (document look). */
  emission: number;
  /** Exposure in stops — applied to the tonemapped color channel only. */
  exposure: number;
  tonemap: Tonemap;
}

export interface ReadResult {
  width: number;
  height: number;
  /** Tightly packed RGBA rows, top row first: u8 per sample, or f16 bits (LE) per sample when hdr. */
  data: Uint8Array;
  hdr: boolean;
}

export interface Scene3DParams {
  primitive: Primitive;
  /** Output texture width / height. */
  texAspect: number;
  facades: number;
  matchAspect: boolean;
  camera: OrbitCamera;
  emission: number;
  /** Exposure in stops. */
  exposure: number;
  tonemap: Tonemap;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  reflections: number;
  fog: number;
  /** Light from the facades scattering in the air around the building (lit haze). */
  haze: number;
  /** Rain streaks catching the light. */
  rain: number;
  environment: number;
  /** Building skin: reflective glass, or matte concrete (faint sheen only). */
  surface: "glass" | "concrete";
  sky: "night" | "bluehour";
  seconds: number;
}

/** 3D preview: the generated texture applied as emission to a building primitive (read-only). */
export interface Scene3DView {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** `frameChanged` tells the view to refresh its (mipmapped) copy of the texture. */
  render(frame: FrameHandle | null, frameChanged: boolean, params: Scene3DParams): void;
  dispose(): void;
}

export interface Renderer {
  readonly info: RendererInfo;
  /** Renders the layer stack into a GPU-resident target identified by `slot`. */
  render(frame: FrameDescription, slot?: string, opts?: RenderOptions): FrameHandle;
  /**
   * Makes every external input of `frame` exact before an offline render:
   * decodes images, loads fonts, seeks videos to their frame time.
   */
  prepare(frame: FrameDescription, slot?: string): Promise<void>;
  /** Called when asynchronously loaded media (decoded image, seeked video frame) becomes available. */
  onMediaChange(cb: () => void): () => void;
  /** Copies `src` into `dst` at pixel offset (x, y) — pastes facade zones into their side. */
  composite(dst: FrameHandle, src: FrameHandle, x: number, y: number): void;
  /** Frees the GPU targets of a render slot that is no longer needed. */
  releaseSlot(slot: string): void;
  createView(canvas: HTMLCanvasElement): RenderView;
  createScene3D(canvas: HTMLCanvasElement): Scene3DView;
  /** Reads a rendered frame back from the GPU as one output channel. */
  readChannel(frame: FrameHandle, req: ReadRequest): Promise<ReadResult>;
  /** Small tonemapped RGBA8 readback, for thumbnails. */
  renderThumbnail(frame: FrameDescription, exposure: number, tonemap: Tonemap): Promise<ImageData>;
  dispose(): void;
}
