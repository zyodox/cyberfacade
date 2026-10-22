import { GLOBALS_FLOATS } from "../../procedural/packing";
import { getGenerator, listGenerators } from "../../procedural/registry";
import { TONEMAPS, type Tonemap } from "../../procedural/types";
import type { FrameDescription, FrameHandle, ReadRequest, ReadResult, Renderer, RendererInfo, RenderOptions, RenderView, Scene3DView, ViewOptions } from "../types";
import { MediaTextures } from "./MediaTextures";
import { Scene3D } from "./Scene3D";
import { assembleLayerShader, hasGeneratorShader, presentShader } from "./shaderLibrary";

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const VIEW_UNIFORM_BYTES = 48;
const CHANNELS = ["color", "emission", "mask", "alpha"] as const;

class GpuFrame implements FrameHandle {
  constructor(
    readonly texture: GPUTexture,
    readonly view: GPUTextureView,
    readonly width: number,
    readonly height: number,
  ) {}
}

interface LayerBinding {
  buffer: GPUBuffer;
  size: number;
  group: GPUBindGroup;
}

/** A named set of ping-pong HDR targets (e.g. interactive preview, full-res, thumbnails). */
interface Slot {
  width: number;
  height: number;
  frames: [GpuFrame, GpuFrame];
  /** Particle sprites are drawn here first (created on demand), bound as the layer's media. */
  scratch?: { texture: GPUTexture; view: GPUTextureView; group: GPUBindGroup };
  /** group0[i] binds frames[i] as the *source* texture. */
  group0: [GPUBindGroup, GPUBindGroup];
  globals: GPUBuffer;
  layers: LayerBinding[];
}

function packView(out: Float32Array, canvasW: number, canvasH: number, opts: ViewOptions, dpr: number, background: boolean): void {
  out[0] = canvasW;
  out[1] = canvasH;
  out[2] = opts.outputSize[0];
  out[3] = opts.outputSize[1];
  out[4] = opts.center[0];
  out[5] = opts.center[1];
  out[6] = opts.scale * dpr;
  out[7] = opts.emission * Math.pow(2, opts.exposure);
  out[8] = Math.max(0, CHANNELS.indexOf(opts.channel));
  out[9] = Math.max(0, TONEMAPS.indexOf(opts.tonemap));
  out[10] = opts.tile ? 1 : 0;
  out[11] = background ? 1 : 0;
}

export class WebGPURenderer implements Renderer {
  readonly info: RendererInfo;
  /** Called if the GPU device is lost (driver reset, TDR…). */
  onDeviceLost: ((reason: string) => void) | null = null;

  private readonly bgl0: GPUBindGroupLayout;
  private readonly bgl1: GPUBindGroupLayout;
  private readonly media: MediaTextures;
  private readonly layerLayout: GPUPipelineLayout;
  private readonly presentBgl: GPUBindGroupLayout;
  private readonly presentLayout: GPUPipelineLayout;
  private readonly presentModule: GPUShaderModule;
  private readonly sampler: GPUSampler;
  private readonly layerPipelines = new Map<string, GPURenderPipeline>();
  /** Instanced sprite pipelines of particle generators: [additive, over]. */
  private readonly particlePipelines = new Map<string, [GPURenderPipeline, GPURenderPipeline]>();
  private readonly scratchSampler: GPUSampler;
  private readonly presentPipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private readonly slots = new Map<string, Slot>();
  private readonly blank: GpuFrame;
  private readonly readTargets = new Map<string, GPUTexture>();
  private readonly readUniform: GPUBuffer;
  private readonly readViewData = new Float32Array(VIEW_UNIFORM_BYTES / 4);

  static async create(): Promise<WebGPURenderer> {
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("WebGPU is not available in this runtime. Update WebView2 / Edge, or your GPU driver.");
    }
    const t0 = performance.now();
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter was found.");
    const t1 = performance.now();
    const device = await adapter.requestDevice({
      requiredLimits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D },
    });
    if (import.meta.env.DEV) console.info(`[boot] adapter ${Math.round(t1 - t0)} ms, device ${Math.round(performance.now() - t1)} ms`);
    const ai = adapter.info;
    const name = [ai?.vendor, ai?.architecture, ai?.description || ai?.device].filter(Boolean).join(" · ") || "WebGPU adapter";
    const renderer = new WebGPURenderer(device, {
      backend: "WebGPU",
      adapter: name,
      maxTextureSize: device.limits.maxTextureDimension2D,
    });
    const t2 = performance.now();
    await renderer.compileAll();
    if (import.meta.env.DEV) console.info(`[boot] pipelines ${Math.round(performance.now() - t2)} ms`);
    return renderer;
  }

  private constructor(
    private readonly device: GPUDevice,
    info: RendererInfo,
  ) {
    this.info = info;
    device.lost.then((l) => this.onDeviceLost?.(l.message || String(l.reason)));
    device.addEventListener("uncapturederror", (ev) => {
      console.error("[WebGPU]", (ev as GPUUncapturedErrorEvent).error.message);
    });

    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "clamp-to-edge" });

    // Vertex visibility: particle layers position their instances in the vertex stage.
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.bgl0 = device.createBindGroupLayout({
      label: "layer-globals",
      entries: [
        { binding: 0, visibility: VF, buffer: { type: "uniform" } },
        { binding: 1, visibility: VF, texture: { sampleType: "float" } },
        { binding: 2, visibility: VF, sampler: { type: "filtering" } },
      ],
    });
    this.bgl1 = device.createBindGroupLayout({
      label: "layer-params",
      entries: [{ binding: 0, visibility: VF, buffer: { type: "uniform" } }],
    });
    this.scratchSampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.media = new MediaTextures(device);
    this.layerLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bgl0, this.bgl1, this.media.bgl] });

    this.presentBgl = device.createBindGroupLayout({
      label: "present",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.presentLayout = device.createPipelineLayout({ bindGroupLayouts: [this.presentBgl] });
    this.presentModule = device.createShaderModule({ label: "present", code: presentShader });

    const blankTex = device.createTexture({
      size: [1, 1],
      format: HDR_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.blank = new GpuFrame(blankTex, blankTex.createView(), 1, 1);
    this.readUniform = device.createBuffer({ size: VIEW_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  // ---------------------------------------------------------------------------
  // Pipelines

  private async compileAll(): Promise<void> {
    const jobs = listGenerators()
      .filter((g) => hasGeneratorShader(g.id))
      .map(async (def) => {
        const code = assembleLayerShader(def);
        const module = this.device.createShaderModule({ label: `layer:${def.id}`, code });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter((m) => m.type === "error");
        if (errors.length) {
          const lines = code.split("\n");
          const detail = errors.map((m) => `  line ${m.lineNum}:${m.linePos} ${m.message}\n    > ${lines[m.lineNum - 1]?.trim()}`).join("\n");
          throw new Error(`WGSL compile error in generator "${def.id}":\n${detail}`);
        }
        const pipeline = await this.device.createRenderPipelineAsync({
          label: `layer:${def.id}`,
          layout: this.layerLayout,
          vertex: { module, entryPoint: "vs_main" },
          fragment: { module, entryPoint: "fs_main", targets: [{ format: HDR_FORMAT }] },
          primitive: { topology: "triangle-list" },
        });
        this.layerPipelines.set(def.id, pipeline);
        if (def.particles) {
          const mk = (over: boolean) =>
            this.device.createRenderPipelineAsync({
              label: `particles:${def.id}:${over ? "over" : "add"}`,
              layout: this.layerLayout,
              vertex: { module, entryPoint: "vs_particle" },
              fragment: {
                module,
                entryPoint: "fs_particle",
                targets: [
                  {
                    format: HDR_FORMAT,
                    blend: {
                      color: { srcFactor: "one", dstFactor: over ? "one-minus-src-alpha" : "one", operation: "add" },
                      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                    },
                  },
                ],
              },
              primitive: { topology: "triangle-list" },
            });
          this.particlePipelines.set(def.id, await Promise.all([mk(false), mk(true)]));
        }
      });
    const presentInfo = await this.presentModule.getCompilationInfo();
    const presentErrors = presentInfo.messages.filter((m) => m.type === "error");
    if (presentErrors.length) throw new Error(`WGSL compile error in present shader: ${presentErrors.map((m) => `line ${m.lineNum}: ${m.message}`).join("; ")}`);
    await Promise.all(jobs);
    await Promise.all([this.presentPipeline(navigator.gpu.getPreferredCanvasFormat()), this.presentPipeline("rgba8unorm")]);
  }

  private presentPipeline(format: GPUTextureFormat): GPURenderPipeline {
    let p = this.presentPipelines.get(format);
    if (!p) {
      p = this.device.createRenderPipeline({
        label: `present:${format}`,
        layout: this.presentLayout,
        vertex: { module: this.presentModule, entryPoint: "vs_main" },
        fragment: { module: this.presentModule, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      this.presentPipelines.set(format, p);
    }
    return p;
  }

  // ---------------------------------------------------------------------------
  // Render targets

  private ensureSlot(name: string, width: number, height: number): Slot {
    let slot = this.slots.get(name);
    if (slot && slot.width === width && slot.height === height) return slot;

    if (slot) for (const f of slot.frames) f.texture.destroy();
    slot?.scratch?.texture.destroy();
    const mk = (k: number) => {
      const tex = this.device.createTexture({
        label: `${name}:${k}`,
        size: [width, height],
        format: HDR_FORMAT,
        // COPY_DST: facade zones are pasted into their side's frame.
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      });
      return new GpuFrame(tex, tex.createView(), width, height);
    };
    const frames: [GpuFrame, GpuFrame] = [mk(0), mk(1)];
    const globals = slot?.globals ?? this.device.createBuffer({ size: GLOBALS_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const g0 = (src: GpuFrame) =>
      this.device.createBindGroup({
        layout: this.bgl0,
        entries: [
          { binding: 0, resource: { buffer: globals } },
          { binding: 1, resource: src.view },
          { binding: 2, resource: this.sampler },
        ],
      });
    slot = { width, height, frames, group0: [g0(frames[0]), g0(frames[1])], globals, layers: slot?.layers ?? [] };
    this.slots.set(name, slot);
    return slot;
  }

  private scratchFor(slot: Slot): NonNullable<Slot["scratch"]> {
    if (!slot.scratch) {
      const texture = this.device.createTexture({
        label: "particles-scratch",
        size: [slot.width, slot.height],
        format: HDR_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const view = texture.createView();
      const group = this.device.createBindGroup({
        layout: this.media.bgl,
        entries: [
          { binding: 0, resource: view },
          { binding: 1, resource: this.scratchSampler },
          { binding: 2, resource: view },
        ],
      });
      slot.scratch = { texture, view, group };
    }
    return slot.scratch;
  }

  private layerBinding(slot: Slot, index: number, bytes: number): LayerBinding {
    const existing = slot.layers[index];
    if (existing && existing.size >= bytes) return existing;
    existing?.buffer.destroy();
    const size = Math.max(1024, Math.ceil(bytes / 256) * 256);
    const buffer = this.device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = this.device.createBindGroup({ layout: this.bgl1, entries: [{ binding: 0, resource: { buffer } }] });
    slot.layers[index] = { buffer, size, group };
    return slot.layers[index];
  }

  // ---------------------------------------------------------------------------
  // Frame rendering

  prepare(frame: FrameDescription, slotName = "main"): Promise<void> {
    return this.media.prepare(frame, slotName);
  }

  onMediaChange(cb: () => void): () => void {
    return this.media.onChange(cb);
  }

  /** Drops GPU copies of a removed asset. */
  forgetAsset(id: string): void {
    this.media.forget(id);
  }

  render(frame: FrameDescription, slotName = "main", opts: RenderOptions = {}): FrameHandle {
    const width = Math.max(1, Math.min(this.info.maxTextureSize, Math.round(frame.width)));
    const height = Math.max(1, Math.min(this.info.maxTextureSize, Math.round(frame.height)));
    const slot = this.ensureSlot(slotName, width, height);
    const q = this.device.queue;
    q.writeBuffer(slot.globals, 0, frame.globals);

    const enc = this.device.createCommandEncoder({ label: `frame:${slotName}` });
    enc
      .beginRenderPass({
        colorAttachments: [{ view: slot.frames[0].view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      })
      .end();

    let src = 0;
    let index = 0;
    for (const layer of frame.layers) {
      const pipeline = this.layerPipelines.get(layer.generator);
      if (!pipeline) continue;
      const binding = this.layerBinding(slot, index++, layer.uniforms.byteLength);
      q.writeBuffer(binding.buffer, 0, layer.uniforms as Float32Array<ArrayBuffer>);
      const dst = 1 - src;
      let mediaGroup = getGenerator(layer.generator)?.blurredPrev
        ? this.media.blurredPrev(enc, slotName, slot.frames[src].view, width, height)
        : this.media.groupFor(opts.mediaSlot ?? slotName, layer.key, layer.media, !!opts.live);
      const sprites = layer.particles ? this.particlePipelines.get(layer.generator) : undefined;
      if (layer.particles && sprites) {
        // Instanced sprites into the scratch target; the layer pass composites it.
        const scratch = this.scratchFor(slot);
        const pp = enc.beginRenderPass({
          colorAttachments: [{ view: scratch.view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
        });
        pp.setPipeline(sprites[layer.particles.over ? 1 : 0]);
        pp.setBindGroup(0, slot.group0[src]);
        pp.setBindGroup(1, binding.group);
        pp.setBindGroup(2, mediaGroup);
        pp.draw(6, layer.particles.count);
        pp.end();
        mediaGroup = scratch.group;
      }
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: slot.frames[dst].view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, slot.group0[src]);
      pass.setBindGroup(1, binding.group);
      pass.setBindGroup(2, mediaGroup);
      pass.draw(3);
      pass.end();
      src = dst;
    }
    q.submit([enc.finish()]);
    return slot.frames[src];
  }

  releaseSlot(name: string): void {
    const slot = this.slots.get(name);
    if (!slot) return;
    slot.frames.forEach((f) => f.texture.destroy());
    slot.scratch?.texture.destroy();
    slot.globals.destroy();
    slot.layers.forEach((l) => l.buffer.destroy());
    this.slots.delete(name);
  }

  composite(dst: FrameHandle, src: FrameHandle, x: number, y: number): void {
    const d = dst as GpuFrame;
    const s = src as GpuFrame;
    const ox = Math.max(0, Math.round(x));
    const oy = Math.max(0, Math.round(y));
    const w = Math.min(s.width, d.width - ox);
    const h = Math.min(s.height, d.height - oy);
    if (w <= 0 || h <= 0) return;
    const enc = this.device.createCommandEncoder({ label: "composite" });
    enc.copyTextureToTexture({ texture: s.texture }, { texture: d.texture, origin: [ox, oy] }, [w, h]);
    this.device.queue.submit([enc.finish()]);
  }

  createView(canvas: HTMLCanvasElement): RenderView {
    return new GpuView(this, canvas);
  }

  createScene3D(canvas: HTMLCanvasElement): Scene3DView {
    return new Scene3D(this.device, canvas);
  }

  /** @internal used by GpuView */
  drawPresent(target: GPUTextureView, format: GPUTextureFormat, uniform: GPUBuffer, frame: FrameHandle | null, cache: WeakMap<GPUTextureView, GPUBindGroup>): void {
    const f = (frame as GpuFrame | null) ?? this.blank;
    let group = cache.get(f.view);
    if (!group) {
      group = this.device.createBindGroup({
        layout: this.presentBgl,
        entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: f.view },
          { binding: 2, resource: this.sampler },
        ],
      });
      cache.set(f.view, group);
    }
    const enc = this.device.createCommandEncoder({ label: "present" });
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store", clearValue: { r: 0.04, g: 0.043, b: 0.047, a: 1 } }],
    });
    pass.setPipeline(this.presentPipeline(format));
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** @internal */
  get gpu(): GPUDevice {
    return this.device;
  }

  /**
   * GPU → CPU readback of one output channel. Conversion (tonemap, channel
   * extraction, emission scaling) happens in a GPU pass; only the final pixels
   * cross the bus. Each call writes its uniforms and submits before awaiting,
   * so several reads (and the next frame's render) can be queued back to back.
   */
  async readChannel(frame: FrameHandle, req: ReadRequest): Promise<ReadResult> {
    const f = frame as GpuFrame;
    const { width: w, height: h } = f;
    const format: GPUTextureFormat = req.hdr ? "rgba16float" : "rgba8unorm";
    const key = `${format}:${w}x${h}`;
    let target = this.readTargets.get(key);
    if (!target) {
      if (this.readTargets.size >= 4) {
        for (const t of this.readTargets.values()) t.destroy();
        this.readTargets.clear();
      }
      target = this.device.createTexture({ size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this.readTargets.set(key, target);
    }

    const channelIndex = req.channel === "color" ? 0 : req.channel === "emission" ? 4 : req.channel === "mask" ? 5 : 6;
    const scale = req.channel === "color" ? req.emission * Math.pow(2, req.exposure) : req.emission;
    const d = this.readViewData;
    d.set([w, h, w, h, 0.5, 0.5, 1, scale, channelIndex, Math.max(0, TONEMAPS.indexOf(req.tonemap)), 0, 0]);
    this.device.queue.writeBuffer(this.readUniform, 0, d);
    this.drawPresent(target.createView(), format, this.readUniform, f, new WeakMap());

    const bpp = req.hdr ? 8 : 4;
    const rowBytes = w * bpp;
    const bytesPerRow = Math.ceil(rowBytes / 256) * 256;
    const readback = this.device.createBuffer({ size: bytesPerRow * h, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder({ label: "readback" });
    enc.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [w, h]);
    this.device.queue.submit([enc.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(readback.getMappedRange());
    const out = new Uint8Array(rowBytes * h);
    if (bytesPerRow === rowBytes) out.set(src);
    else for (let y = 0; y < h; y++) out.set(src.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
    readback.unmap();
    readback.destroy();
    return { width: w, height: h, data: out, hdr: req.hdr };
  }

  async renderThumbnail(frame: FrameDescription, exposure: number, tonemap: Tonemap): Promise<ImageData> {
    if (frame.layers.some((l) => l.media)) await this.prepare(frame, "thumb");
    const handle = this.render(frame, "thumb");
    const r = await this.readChannel(handle, { channel: "color", hdr: false, emission: 1, exposure, tonemap });
    return new ImageData(new Uint8ClampedArray(r.data.buffer as ArrayBuffer, r.data.byteOffset, r.data.byteLength), r.width, r.height);
  }

  dispose(): void {
    for (const slot of this.slots.values()) {
      slot.frames.forEach((f) => f.texture.destroy());
      slot.globals.destroy();
      slot.layers.forEach((l) => l.buffer.destroy());
    }
    this.slots.clear();
    for (const t of this.readTargets.values()) t.destroy();
    this.media.dispose();
    this.device.destroy();
  }
}

class GpuView implements RenderView {
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly uniform: GPUBuffer;
  private readonly data = new Float32Array(VIEW_UNIFORM_BYTES / 4);
  private readonly groups = new WeakMap<GPUTextureView, GPUBindGroup>();
  private dpr = 1;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Could not create a WebGPU canvas context.");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: renderer.gpu, format: this.format, alphaMode: "opaque" });
    this.uniform = renderer.gpu.createBuffer({ size: VIEW_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  present(frame: FrameHandle | null, opts: ViewOptions): void {
    packView(this.data, this.canvas.width, this.canvas.height, opts, this.dpr, true);
    this.renderer.gpu.queue.writeBuffer(this.uniform, 0, this.data);
    this.renderer.drawPresent(this.ctx.getCurrentTexture().createView(), this.format, this.uniform, frame, this.groups);
  }

  dispose(): void {
    this.uniform.destroy();
    this.ctx.unconfigure();
  }
}
