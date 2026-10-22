import { buildPrimitive, VERTEX_FLOATS, type MeshData } from "../../preview3d/geometry";
import { orbitMatrices } from "../../preview3d/mat4";
import { TONEMAPS } from "../../procedural/types";
import type { FrameHandle, Scene3DParams, Scene3DView } from "../types";
import { postShader, scene3dShader } from "./shaderLibrary";

const HDR: GPUTextureFormat = "rgba16float";
const DEPTH: GPUTextureFormat = "depth24plus";
const SAMPLES = 4;
const BLOOM_LEVELS = 6;
const SCENE_UNIFORM_BYTES = 2048;
const POST_UNIFORM_BYTES = 48;

/** The pieces of the WebGPU renderer the 3D view needs (kept narrow on purpose). */
export interface GpuFrameLike extends FrameHandle {
  readonly texture: GPUTexture;
}

interface Targets {
  width: number;
  height: number;
  msaa: GPUTextureView;
  depth: GPUTextureView;
  hdr: GPUTexture;
  hdrView: GPUTextureView;
  bloom: { tex: GPUTexture; view: GPUTextureView; w: number; h: number }[];
  /** Post bind groups: prefilter(hdr), down[i], up[i], composite. */
  groups: { prefilter: GPUBindGroup; down: GPUBindGroup[]; up: GPUBindGroup[]; composite: GPUBindGroup };
  uniforms: GPUBuffer[];
}

/**
 * WebGPU 3D preview: the texture on a building primitive, under a night sky.
 * Pass order per frame: (texture changed → copy + mip chain) → MSAA scene
 * [sky, mirrored building, wet ground, building] → resolve → bloom chain →
 * composite/tonemap → canvas. It only reads the rendered texture.
 */
export class Scene3D implements Scene3DView {
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly sceneBgl: GPUBindGroupLayout;
  private readonly drawBgl: GPUBindGroupLayout;
  private readonly postBgl: GPUBindGroupLayout;
  private readonly skyPipe: GPURenderPipeline;
  private readonly meshPipe: GPURenderPipeline;
  private readonly groundPipe: GPURenderPipeline;
  private readonly prefilterPipe: GPURenderPipeline;
  private readonly downPipe: GPURenderPipeline;
  private readonly upPipe: GPURenderPipeline;
  private readonly compositePipe: GPURenderPipeline;
  private readonly blitPipe: GPURenderPipeline;
  private readonly sceneUniform: GPUBuffer;
  private readonly drawGroups: [GPUBindGroup, GPUBindGroup];
  private readonly emissSampler: GPUSampler;
  private readonly postSampler: GPUSampler;
  private readonly dummy: GPUTexture;
  private readonly sceneData = new Float32Array(SCENE_UNIFORM_BYTES / 4);
  private readonly postData = new Float32Array(POST_UNIFORM_BYTES / 4);

  private emiss: GPUTexture;
  private emissKey = "";
  private sceneGroup: GPUBindGroup;
  private sceneGroupKey = "";
  private mesh: { key: string; data: MeshData; vbuf: GPUBuffer; ibuf: GPUBuffer; count: number } | null = null;
  private targets: Targets | null = null;

  constructor(
    private readonly device: GPUDevice,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Could not create a WebGPU canvas context.");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });

    const sceneModule = device.createShaderModule({ label: "scene3d", code: scene3dShader });
    const postModule = device.createShaderModule({ label: "post", code: postShader });
    void this.reportCompile(sceneModule, "scene3d");
    void this.reportCompile(postModule, "post");

    const tex = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } });
    this.sceneBgl = device.createBindGroupLayout({
      label: "scene",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        tex(1),
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        tex(3),
        tex(4),
        tex(5),
        tex(6),
      ],
    });
    this.drawBgl = device.createBindGroupLayout({
      label: "draw",
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });
    this.postBgl = device.createBindGroupLayout({
      label: "post",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        tex(1),
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        tex(3),
      ],
    });
    const sceneLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneBgl, this.drawBgl] });
    const postLayout = device.createPipelineLayout({ bindGroupLayouts: [this.postBgl] });

    const ms: GPUMultisampleState = { count: SAMPLES };
    const depthWrite: GPUDepthStencilState = { format: DEPTH, depthWriteEnabled: true, depthCompare: "less" };
    this.skyPipe = device.createRenderPipeline({
      label: "sky",
      layout: sceneLayout,
      vertex: { module: sceneModule, entryPoint: "vs_sky" },
      fragment: { module: sceneModule, entryPoint: "fs_sky", targets: [{ format: HDR }] },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "always" },
      multisample: ms,
    });
    this.meshPipe = device.createRenderPipeline({
      label: "mesh",
      layout: sceneLayout,
      vertex: {
        module: sceneModule,
        entryPoint: "vs_mesh",
        buffers: [
          {
            arrayStride: VERTEX_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x2" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ],
          },
        ],
      },
      fragment: { module: sceneModule, entryPoint: "fs_mesh", targets: [{ format: HDR }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depthWrite,
      multisample: ms,
    });
    this.groundPipe = device.createRenderPipeline({
      label: "ground",
      layout: sceneLayout,
      vertex: { module: sceneModule, entryPoint: "vs_ground" },
      fragment: {
        module: sceneModule,
        entryPoint: "fs_ground",
        targets: [
          {
            format: HDR,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "zero", operation: "add" },
            },
          },
        ],
      },
      depthStencil: depthWrite,
      multisample: ms,
    });


    const post = (entry: string, format: GPUTextureFormat, additive = false) =>
      device.createRenderPipeline({
        label: entry,
        layout: postLayout,
        vertex: { module: postModule, entryPoint: "vs_full" },
        fragment: {
          module: postModule,
          entryPoint: entry,
          targets: [
            additive
              ? { format, blend: { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } } }
              : { format },
          ],
        },
      });
    this.prefilterPipe = post("fs_prefilter", HDR);
    this.downPipe = post("fs_down", HDR);
    this.upPipe = post("fs_up", HDR, true);
    this.compositePipe = post("fs_composite", this.format);
    this.blitPipe = post("fs_blit", HDR);

    this.sceneUniform = device.createBuffer({ size: SCENE_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const drawBuf = (mirror: number) => {
      const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM, mappedAtCreation: true });
      new Float32Array(b.getMappedRange()).set([mirror, 0, 0, 0]);
      b.unmap();
      return device.createBindGroup({ layout: this.drawBgl, entries: [{ binding: 0, resource: { buffer: b } }] });
    };
    this.drawGroups = [drawBuf(0), drawBuf(1)];

    this.emissSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      maxAnisotropy: 16,
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    this.postSampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    this.dummy = device.createTexture({ size: [1, 1], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.emiss = this.dummy;
    this.sceneGroup = this.makeSceneGroup();
  }

  private async reportCompile(m: GPUShaderModule, name: string) {
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) if (msg.type === "error") console.error(`[${name}.wgsl] line ${msg.lineNum}:${msg.linePos} ${msg.message}`);
  }

  private makeSceneGroup(): GPUBindGroup {
    // Bindings 3–6 are the shader's per-side facade slots (unused by the primitive preview).
    const side = () => this.dummy.createView();
    return this.device.createBindGroup({
      layout: this.sceneBgl,
      entries: [
        { binding: 0, resource: { buffer: this.sceneUniform } },
        { binding: 1, resource: this.emiss.createView() },
        { binding: 2, resource: this.emissSampler },
        { binding: 3, resource: side() },
        { binding: 4, resource: side() },
        { binding: 5, resource: side() },
        { binding: 6, resource: side() },
      ],
    });
  }

  private refreshSceneGroup() {
    const key = this.emissKey;
    if (key === this.sceneGroupKey) return;
    this.sceneGroupKey = key;
    this.sceneGroup = this.makeSceneGroup();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // --- resources ---------------------------------------------------------------------------

  private ensureMesh(p: Scene3DParams) {
    const key = `${p.primitive}|${p.texAspect.toFixed(4)}|${p.facades}|${p.matchAspect}`;
    if (this.mesh?.key === key) return this.mesh;
    this.mesh?.vbuf.destroy();
    this.mesh?.ibuf.destroy();
    const data = buildPrimitive({ primitive: p.primitive, texAspect: p.texAspect, facades: p.facades, matchAspect: p.matchAspect });
    const vbuf = this.device.createBuffer({ size: data.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const ibuf = this.device.createBuffer({ size: data.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vbuf, 0, data.vertices as Float32Array<ArrayBuffer>);
    this.device.queue.writeBuffer(ibuf, 0, data.indices as Uint32Array<ArrayBuffer>);
    this.mesh = { key, data, vbuf, ibuf, count: data.indices.length };
    return this.mesh;
  }

  /** Box-filtered mip chain of `tex` (level 0 already filled). */
  private generateMips(enc: GPUCommandEncoder, tex: GPUTexture, levels: number) {
    const blank = this.dummy.createView();
    for (let l = 1; l < levels; l++) {
      const src = tex.createView({ baseMipLevel: l - 1, mipLevelCount: 1 });
      const dst = tex.createView({ baseMipLevel: l, mipLevelCount: 1 });
      const group = this.device.createBindGroup({
        layout: this.postBgl,
        entries: [
          { binding: 0, resource: { buffer: this.mipUniform() } },
          { binding: 1, resource: src },
          { binding: 2, resource: this.postSampler },
          { binding: 3, resource: blank },
        ],
      });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: dst, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.blitPipe);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    }
  }

  private mipTexture(w: number, h: number, label: string): { tex: GPUTexture; levels: number } {
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    const tex = this.device.createTexture({
      label,
      size: [w, h],
      format: HDR,
      mipLevelCount: levels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
    });
    return { tex, levels };
  }

  /** Copies the procedural frame into a mipmapped texture (for anisotropic 3D sampling). */
  private updateEmission(frame: GpuFrameLike, enc: GPUCommandEncoder) {
    const { width: w, height: h } = frame;
    const key = `${w}x${h}`;
    if (key !== this.emissKey) {
      if (this.emiss !== this.dummy) this.emiss.destroy();
      this.emiss = this.mipTexture(w, h, "emission-mips").tex;
      this.emissKey = key;
    }
    enc.copyTextureToTexture({ texture: frame.texture }, { texture: this.emiss, mipLevel: 0 }, [w, h]);
    this.generateMips(enc, this.emiss, this.emiss.mipLevelCount);
  }

  private mipUniformBuf: GPUBuffer | null = null;
  private mipUniform(): GPUBuffer {
    this.mipUniformBuf ??= this.device.createBuffer({ size: POST_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM });
    return this.mipUniformBuf;
  }

  private ensureTargets(): Targets {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.targets && this.targets.width === w && this.targets.height === h) return this.targets;
    this.destroyTargets();
    const d = this.device;
    const msaa = d.createTexture({ size: [w, h], format: HDR, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const depth = d.createTexture({ size: [w, h], format: DEPTH, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const hdr = d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const bloom: Targets["bloom"] = [];
    let bw = w;
    let bh = h;
    for (let l = 0; l < BLOOM_LEVELS; l++) {
      bw = Math.max(1, Math.floor(bw / 2));
      bh = Math.max(1, Math.floor(bh / 2));
      const tex = d.createTexture({ size: [bw, bh], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      bloom.push({ tex, view: tex.createView(), w: bw, h: bh });
    }
    const uniforms: GPUBuffer[] = [];
    const group = (src: GPUTextureView, second?: GPUTextureView) => {
      const u = d.createBuffer({ size: POST_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      uniforms.push(u);
      return d.createBindGroup({
        layout: this.postBgl,
        entries: [
          { binding: 0, resource: { buffer: u } },
          { binding: 1, resource: src },
          { binding: 2, resource: this.postSampler },
          { binding: 3, resource: second ?? this.dummy.createView() },
        ],
      });
    };
    const hdrView = hdr.createView();
    const groups = {
      prefilter: group(hdrView),
      down: bloom.slice(0, -1).map((b) => group(b.view)), // down[i]: bloom[i] → bloom[i+1]
      up: bloom.slice(1).map((b) => group(b.view)), // up[i]: bloom[i+1] → bloom[i] (additive)
      composite: group(hdrView, bloom[0].view),
    };
    this.targets = { width: w, height: h, msaa: msaa.createView(), depth: depth.createView(), hdr, hdrView, bloom, groups, uniforms };
    (this.targets as Targets & { _own: GPUTexture[] })._own = [msaa, depth];
    return this.targets;
  }

  private destroyTargets() {
    const t = this.targets as (Targets & { _own?: GPUTexture[] }) | null;
    if (!t) return;
    t._own?.forEach((x) => x.destroy());
    t.hdr.destroy();
    t.bloom.forEach((b) => b.tex.destroy());
    t.uniforms.forEach((u) => u.destroy());
    this.targets = null;
  }

  private writePost(buf: GPUBuffer, srcW: number, srcH: number, p: Scene3DParams) {
    const d = this.postData;
    d.fill(0);
    d[0] = 1 / srcW;
    d[1] = 1 / srcH;
    d[2] = p.rain ?? 0;
    d[3] = p.seconds;
    d[4] = p.bloomThreshold;
    d[5] = p.bloomThreshold * 0.5;
    d[6] = p.bloom * 0.12;
    d[7] = 0.6 + p.bloomRadius;
    d[8] = Math.pow(2, p.exposure);
    d[9] = Math.max(0, TONEMAPS.indexOf(p.tonemap));
    d[10] = 0.35;
    this.device.queue.writeBuffer(buf, 0, d);
  }

  private writeScene(p: Scene3DParams, t: Targets, H: number, radius: number, uAround: number) {
    const { eye, viewProj, invViewProj } = orbitMatrices(p.camera, t.width / t.height, H);
    const s = this.sceneData;
    s.set(viewProj, 0);
    s.set(invViewProj, 16);
    s.set([eye[0], eye[1], eye[2], p.seconds], 32);
    s.set([p.emission, p.reflections, p.fog, p.environment], 36);
    s.set([H, radius, 60 * H, uAround], 40);
    s.set([p.surface === "concrete" ? 1 : 0, p.sky === "bluehour" ? 1 : 0, p.haze ?? 0, p.rain ?? 0], 44);
    // Shader's building-mode slots (mode, grow, shading, max mip): off for the primitive preview.
    s.set([0, 0, 0, 0], 48);
  }

  private post(enc: GPUCommandEncoder, t: Targets, p: Scene3DParams) {
    // Bloom: prefilter + downsample chain, then additive tent upsample back up.
    const fullscreen = (view: GPUTextureView, pipe: GPURenderPipeline, group: GPUBindGroup, load: GPULoadOp) => {
      const pp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pp.setPipeline(pipe);
      pp.setBindGroup(0, group);
      pp.draw(3);
      pp.end();
    };
    if (p.bloom > 0) {
      this.writePost(t.uniforms[0], t.width, t.height, p);
      fullscreen(t.bloom[0].view, this.prefilterPipe, t.groups.prefilter, "clear");
      for (let l = 0; l < BLOOM_LEVELS - 1; l++) {
        this.writePost(t.uniforms[1 + l], t.bloom[l].w, t.bloom[l].h, p);
        fullscreen(t.bloom[l + 1].view, this.downPipe, t.groups.down[l], "clear");
      }
      for (let l = BLOOM_LEVELS - 2; l >= 0; l--) {
        const u = t.uniforms[BLOOM_LEVELS + l];
        this.writePost(u, t.bloom[l + 1].w, t.bloom[l + 1].h, p);
        fullscreen(t.bloom[l].view, this.upPipe, t.groups.up[l], "load");
      }
    }
    // With bloom off the composite gets intensity 0, so a stale bloom[0] is ignored.
    this.writePost(t.uniforms[t.uniforms.length - 1], t.width, t.height, { ...p, bloom: Math.max(0, p.bloom) });
    fullscreen(this.ctx.getCurrentTexture().createView(), this.compositePipe, t.groups.composite, "clear");
  }

  // --- frame: primitive ----------------------------------------------------------------------

  render(frame: FrameHandle | null, frameChanged: boolean, p: Scene3DParams): void {
    const mesh = this.ensureMesh(p);
    const t = this.ensureTargets();
    const enc = this.device.createCommandEncoder({ label: "scene3d" });
    if (frame && (frameChanged || this.emiss === this.dummy)) this.updateEmission(frame as GpuFrameLike, enc);
    this.refreshSceneGroup();

    const H = mesh.data.height;
    this.writeScene(p, t, H, mesh.data.radius, mesh.data.uAround);
    this.device.queue.writeBuffer(this.sceneUniform, 0, this.sceneData);

    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: t.msaa, resolveTarget: t.hdrView, loadOp: "clear", storeOp: "discard", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      depthStencilAttachment: { view: t.depth, depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "discard" },
    });
    pass.setBindGroup(0, this.sceneGroup);
    pass.setBindGroup(1, this.drawGroups[0]);
    pass.setPipeline(this.skyPipe);
    pass.draw(3);
    // Planar reflection: mirrored building below the ground plane.
    if (p.reflections > 0) {
      pass.setPipeline(this.meshPipe);
      pass.setBindGroup(1, this.drawGroups[1]);
      pass.setVertexBuffer(0, mesh.vbuf);
      pass.setIndexBuffer(mesh.ibuf, "uint32");
      pass.drawIndexed(mesh.count);
      pass.setBindGroup(1, this.drawGroups[0]);
    }
    pass.setPipeline(this.groundPipe);
    pass.draw(6);
    pass.setPipeline(this.meshPipe);
    pass.setVertexBuffer(0, mesh.vbuf);
    pass.setIndexBuffer(mesh.ibuf, "uint32");
    pass.drawIndexed(mesh.count);
    pass.end();

    this.post(enc, t, p);
    this.device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    this.destroyTargets();
    this.mesh?.vbuf.destroy();
    this.mesh?.ibuf.destroy();
    if (this.emiss !== this.dummy) this.emiss.destroy();
    this.dummy.destroy();
    this.sceneUniform.destroy();
    this.mipUniformBuf?.destroy();
    this.ctx.unconfigure();
  }
}
