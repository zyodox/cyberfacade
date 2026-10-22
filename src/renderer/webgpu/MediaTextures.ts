/**
 * External textures for layer passes (bind group 2): imported images, video
 * frames and rasterized sign text. Every texture is mipmapped on the GPU so
 * shaders can sample blurred levels cheaply (neon glow, LED cell averaging,
 * minified billboards).
 *
 * Videos: in live preview they play continuously and are drift-corrected
 * against the loop clock; offline renders call `prepare()` which seeks each
 * video to its exact frame time first, so exports are frame-accurate and loop.
 */
import { assetBitmap, assetBitmapAsync, assetBlob, assetMeta, assetUrl, ensureAsset, onAssetsChanged } from "../../assets/assets";
import { rasterizeLogo } from "../../assets/logoRaster";
import { rasterizeText } from "../../assets/textRaster";
import type { MediaRef, SingleMediaRef } from "../../procedural/types";
import type { FrameDescription } from "../types";

const MEDIA_FORMAT: GPUTextureFormat = "rgba8unorm";
const GC_MS = 15000;

const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> O {
  var o: O;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  o.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  o.uv = vec2f(x, y);
  return o;
}
@fragment fn fs(i: O) -> @location(0) vec4f { return textureSampleLevel(src, samp, i.uv, 0.0); }
`;

interface TexEntry {
  uid: number;
  texture: GPUTexture;
  group: GPUBindGroup;
  mipGroups: GPUBindGroup[];
  mipViews: GPUTextureView[];
  width: number;
  height: number;
  lastUsed: number;
}

interface VideoEntry {
  el: HTMLVideoElement;
  assetId: string;
  tex: TexEntry | null;
  lastUsed: number;
  seekWaiters: (() => void)[];
}

function levelsFor(w: number, h: number): number {
  return Math.floor(Math.log2(Math.max(w, h))) + 1;
}

/** Signed distance between two times on a loop of length d. */
function loopDiff(a: number, b: number, d: number): number {
  if (d <= 0) return a - b;
  let x = (a - b) % d;
  if (x > d / 2) x -= d;
  if (x < -d / 2) x += d;
  return x;
}

export class MediaTextures {
  readonly bgl: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;
  private readonly dummyGroup: GPUBindGroup;
  private readonly mipBgl: GPUBindGroupLayout;
  private readonly mipPipeline: GPURenderPipeline;
  private readonly hdrMipPipeline: GPURenderPipeline;
  private readonly blurred = new Map<string, TexEntry>();
  private readonly srcGroups = new WeakMap<GPUTextureView, GPUBindGroup>();
  private readonly images = new Map<string, TexEntry>();
  private readonly texts = new Map<string, TexEntry>();
  private readonly videos = new Map<string, VideoEntry>();
  /** Vector / raster logos: colour texture + stroke-data texture (null while rasterizing). */
  private readonly logos = new Map<string, { color: TexEntry; data: TexEntry; lastUsed: number } | null>();
  private readonly pairGroups = new Map<string, GPUBindGroup>();
  private uidCounter = 0;
  private readonly listeners = new Set<() => void>();
  private readonly textCanvas = document.createElement("canvas");
  private fontEpoch = 0;
  private textEpochs = new Map<string, number>();
  private lastGc = performance.now();

  constructor(private readonly device: GPUDevice) {
    this.bgl = device.createBindGroupLayout({
      label: "layer-media",
      entries: [
        // Vertex too: particle passes read sprite / text-atlas data per instance.
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        // Second texture: incoming playlist item / logo stroke data (else the first one again).
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const dummy = device.createTexture({ size: [1, 1], format: MEDIA_FORMAT, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const dummyView = dummy.createView();
    this.dummyGroup = device.createBindGroup({
      layout: this.bgl,
      entries: [
        { binding: 0, resource: dummyView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: dummyView },
      ],
    });

    this.mipBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const module = device.createShaderModule({ label: "media-mips", code: MIP_WGSL });
    this.mipPipeline = device.createRenderPipeline({
      label: "media-mips",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.mipBgl] }),
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: MEDIA_FORMAT }] },
      primitive: { topology: "triangle-list" },
    });
    this.hdrMipPipeline = device.createRenderPipeline({
      label: "prev-mips",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.mipBgl] }),
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list" },
    });

    onAssetsChanged(() => {
      this.fontEpoch++;
      this.notify();
    });
    document.fonts?.addEventListener?.("loadingdone", () => {
      this.fontEpoch++;
      this.notify();
    });
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((f) => f());
  }

  get empty(): GPUBindGroup {
    return this.dummyGroup;
  }

  // ---------------------------------------------------------------------------

  private createTex(label: string, width: number, height: number, format: GPUTextureFormat = MEDIA_FORMAT): TexEntry {
    const levels = levelsFor(width, height);
    const texture = this.device.createTexture({
      label,
      size: [width, height],
      format,
      mipLevelCount: levels,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const mipViews = Array.from({ length: levels }, (_, l) => texture.createView({ baseMipLevel: l, mipLevelCount: 1 }));
    const mipGroups = mipViews.slice(0, -1).map((v) =>
      this.device.createBindGroup({
        layout: this.mipBgl,
        entries: [
          { binding: 0, resource: v },
          { binding: 1, resource: this.sampler },
        ],
      }),
    );
    const view = texture.createView();
    const group = this.device.createBindGroup({
      layout: this.bgl,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: view },
      ],
    });
    return { uid: ++this.uidCounter, texture, group, mipGroups, mipViews, width, height, lastUsed: performance.now() };
  }

  /** Bind group with two textures (mediaTex = a, mediaTex2 = b). */
  private pairGroup(a: TexEntry, b: TexEntry): GPUBindGroup {
    const key = `${a.uid}|${b.uid}`;
    let g = this.pairGroups.get(key);
    if (!g) {
      if (this.pairGroups.size > 256) this.pairGroups.clear();
      g = this.device.createBindGroup({
        layout: this.bgl,
        entries: [
          { binding: 0, resource: a.texture.createView() },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: b.texture.createView() },
        ],
      });
      this.pairGroups.set(key, g);
    }
    return g;
  }

  private upload(entry: TexEntry, source: GPUCopyExternalImageSource): void {
    this.device.queue.copyExternalImageToTexture({ source }, { texture: entry.texture, mipLevel: 0 }, [entry.width, entry.height]);
    const enc = this.device.createCommandEncoder({ label: "media-mips" });
    for (let l = 1; l < entry.mipViews.length; l++) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: entry.mipViews[l], loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.mipPipeline);
      pass.setBindGroup(0, entry.mipGroups[l - 1]);
      pass.draw(3);
      pass.end();
    }
    this.device.queue.submit([enc.finish()]);
  }

  private fitSize(w: number, h: number): [number, number] {
    const max = this.device.limits.maxTextureDimension2D;
    const f = Math.min(1, max / Math.max(w, h));
    return [Math.max(1, Math.floor(w * f)), Math.max(1, Math.floor(h * f))];
  }

  // ---------------------------------------------------------------------------

  /**
   * Half-resolution HDR mip chain of the accumulated image so far (recorded
   * into `enc` before the layer pass that samples it) — wide, smooth light
   * spill for a few texture taps.
   */
  blurredPrev(enc: GPUCommandEncoder, key: string, src: GPUTextureView, width: number, height: number): GPUBindGroup {
    const w = Math.max(1, width >> 1);
    const h = Math.max(1, height >> 1);
    let e = this.blurred.get(key);
    if (!e || e.width !== w || e.height !== h) {
      e?.texture.destroy();
      e = this.createTex(`blurred:${key}`, w, h, "rgba16float");
      this.blurred.set(key, e);
    }
    let g = this.srcGroups.get(src);
    if (!g) {
      g = this.device.createBindGroup({
        layout: this.mipBgl,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: this.sampler },
        ],
      });
      this.srcGroups.set(src, g);
    }
    for (let l = 0; l < e.mipViews.length; l++) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: e.mipViews[l], loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.hdrMipPipeline);
      pass.setBindGroup(0, l === 0 ? g : e.mipGroups[l - 1]);
      pass.draw(3);
      pass.end();
    }
    return e.group;
  }

  /** Bind group for a layer pass; falls back to an empty 1×1 texture while loading. */
  groupFor(slot: string, layerKey: string, ref: MediaRef | undefined, live: boolean): GPUBindGroup {
    const now = performance.now();
    if (now - this.lastGc > 2000) this.gc(now);
    if (!ref) return this.dummyGroup;
    if (ref.kind === "pair") {
      const a = this.entryFor(slot, layerKey, ref.a, live, now);
      const b = ref.b ? this.entryFor(slot, layerKey, ref.b, live, now) : null;
      if (!a) return b ? b.group : this.dummyGroup;
      return b ? this.pairGroup(a, b) : a.group;
    }
    if (ref.kind === "logo") {
      const l = this.logoEntries(ref, now);
      return l ? this.pairGroup(l.color, l.data) : this.dummyGroup;
    }
    return this.entryFor(slot, layerKey, ref, live, now)?.group ?? this.dummyGroup;
  }

  private entryFor(slot: string, layerKey: string, ref: SingleMediaRef, live: boolean, now: number): TexEntry | null {
    switch (ref.kind) {
      case "image":
        return this.imageEntry(ref.assetId, now);
      case "text":
        return this.textEntry(ref, now);
      case "video":
        return this.videoTex(`${slot}|${layerKey}${ref.tag ? `|${ref.tag}` : ""}`, ref, live, now);
    }
  }

  private logoEntries(ref: Extract<MediaRef, { kind: "logo" }>, now: number): { color: TexEntry; data: TexEntry } | null {
    const e = this.logos.get(ref.key);
    if (e) {
      e.lastUsed = now;
      return e;
    }
    if (e === null) return null; // rasterizing
    this.logos.set(ref.key, null);
    void this.buildLogo(ref).then((ok) => {
      if (!ok) this.logos.delete(ref.key);
      this.notify();
    });
    return null;
  }

  private async buildLogo(ref: Extract<MediaRef, { kind: "logo" }>): Promise<boolean> {
    if (!(await ensureAsset(ref.assetId))) return false;
    const blob = assetBlob(ref.assetId);
    const meta = assetMeta(ref.assetId);
    if (!blob || !meta) return false;
    try {
      const r = await rasterizeLogo(blob, meta.mime, ref.stroke, this.device.limits.maxTextureDimension2D);
      if (!this.logos.has(ref.key)) return false;
      const color = this.createTex(`logo:${ref.assetId}`, r.color.width, r.color.height);
      this.upload(color, r.color);
      const data = this.createTex(`logo-data:${ref.assetId}`, r.data.width, r.data.height);
      this.upload(data, r.data);
      this.logos.set(ref.key, { color, data, lastUsed: performance.now() });
      return true;
    } catch (e) {
      console.warn("Logo rasterization failed", e);
      return false;
    }
  }

  private imageEntry(id: string, now: number): TexEntry | null {
    let e = this.images.get(id);
    if (!e) {
      const bmp = assetBitmap(id);
      if (!bmp) return null;
      const [w, h] = this.fitSize(bmp.width, bmp.height);
      if (w !== bmp.width || h !== bmp.height) {
        void createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }).then((small) => {
          if (this.images.has(id)) return;
          const ne = this.createTex(`image:${id}`, w, h);
          this.upload(ne, small);
          this.images.set(id, ne);
          this.notify();
        });
        return null;
      }
      e = this.createTex(`image:${id}`, w, h);
      this.upload(e, bmp);
      this.images.set(id, e);
    }
    e.lastUsed = now;
    return e;
  }

  private textEntry(ref: Extract<MediaRef, { kind: "text" }>, now: number): TexEntry {
    let e = this.texts.get(ref.key);
    if (e && this.textEpochs.get(ref.key) !== this.fontEpoch) {
      // A font finished loading since this was rasterized: redraw in place when the size matches.
      const canvas = rasterizeText(ref.spec, this.textCanvas);
      if (canvas.width === e.width && canvas.height === e.height) this.upload(e, canvas);
      else {
        e.texture.destroy();
        this.texts.delete(ref.key);
        e = undefined;
      }
      this.textEpochs.set(ref.key, this.fontEpoch);
    }
    if (!e) {
      const canvas = rasterizeText(ref.spec, this.textCanvas);
      e = this.createTex("text", canvas.width, canvas.height);
      this.upload(e, canvas);
      this.texts.set(ref.key, e);
      this.textEpochs.set(ref.key, this.fontEpoch);
    }
    e.lastUsed = now;
    return e;
  }

  private videoEntry(key: string, assetId: string): VideoEntry | null {
    let v = this.videos.get(key);
    if (v && v.assetId !== assetId) {
      this.disposeVideo(key, v);
      v = undefined;
    }
    if (!v) {
      const url = assetUrl(assetId);
      if (!url) return null;
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.loop = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      const entry: VideoEntry = { el, assetId, tex: null, lastUsed: performance.now(), seekWaiters: [] };
      el.addEventListener("seeked", () => {
        entry.seekWaiters.splice(0).forEach((f) => f());
        this.notify();
      });
      el.addEventListener("loadeddata", () => this.notify());
      el.src = url;
      v = entry;
      this.videos.set(key, v);
    }
    return v;
  }

  private videoTex(key: string, ref: Extract<SingleMediaRef, { kind: "video" }>, live: boolean, now: number): TexEntry | null {
    const v = this.videoEntry(key, ref.assetId);
    if (!v) return null;
    v.lastUsed = now;
    const el = v.el;
    const dur = Number.isFinite(el.duration) ? el.duration : (assetMeta(ref.assetId)?.duration ?? 0);

    if (live && ref.rate > 0) {
      const rate = Math.min(16, Math.max(0.0625, ref.rate));
      if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
      if (el.readyState >= 1 && !el.seeking && Math.abs(loopDiff(el.currentTime, ref.time, dur)) > 0.25) el.currentTime = ref.time;
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      if (!el.paused) el.pause();
      if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - ref.time) > 1 / 240) el.currentTime = ref.time;
    }

    if (el.readyState >= 2 && el.videoWidth > 0) {
      const [w, h] = this.fitSize(el.videoWidth, el.videoHeight);
      if (!v.tex || v.tex.width !== w || v.tex.height !== h) {
        v.tex?.texture.destroy();
        v.tex = this.createTex(`video:${ref.assetId}`, w, h);
      }
      try {
        this.upload(v.tex, el);
      } catch (e) {
        console.warn("Video frame upload failed", e);
      }
    }
    return v.tex;
  }

  /** Exact inputs for an offline render: decoded images, loaded fonts, seeked videos, rasterized logos. */
  async prepare(frame: FrameDescription, slot: string): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    const single = (key: string, ref: SingleMediaRef) => {
      if (ref.kind === "image") jobs.push(assetBitmapAsync(ref.assetId));
      else if (ref.kind === "text") jobs.push(document.fonts.load(`${ref.spec.weight} 64px "${ref.spec.family}"`, ref.spec.text).catch(() => undefined));
      else jobs.push(this.seekVideo(`${slot}|${key}${ref.tag ? `|${ref.tag}` : ""}`, ref));
    };
    for (const layer of frame.layers) {
      const ref = layer.media;
      if (!ref) continue;
      if (ref.kind === "pair") {
        single(layer.key, ref.a);
        if (ref.b) single(layer.key, ref.b);
      } else if (ref.kind === "logo") {
        if (!this.logos.get(ref.key)) {
          this.logos.set(ref.key, null);
          jobs.push(this.buildLogo(ref).then((ok) => (ok ? undefined : this.logos.delete(ref.key))));
        }
      } else single(layer.key, ref);
    }
    await Promise.all(jobs);
  }

  private async seekVideo(key: string, ref: Extract<SingleMediaRef, { kind: "video" }>): Promise<void> {
    if (!(await ensureAsset(ref.assetId))) return;
    const v = this.videoEntry(key, ref.assetId);
    if (!v) return;
    const el = v.el;
    v.lastUsed = performance.now();
    if (el.readyState < 2) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        el.addEventListener("loadeddata", done, { once: true });
        el.addEventListener("error", done, { once: true });
        setTimeout(done, 8000);
      });
    }
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - ref.time) < 1e-4 && !el.seeking) return;
    await new Promise<void>((resolve) => {
      v.seekWaiters.push(resolve);
      el.currentTime = ref.time;
      setTimeout(resolve, 4000);
    });
  }

  private disposeVideo(key: string, v: VideoEntry): void {
    v.el.pause();
    v.el.removeAttribute("src");
    v.el.load();
    v.tex?.texture.destroy();
    this.videos.delete(key);
  }

  private gc(now: number): void {
    this.lastGc = now;
    for (const [k, e] of this.images) if (now - e.lastUsed > GC_MS) (e.texture.destroy(), this.images.delete(k));
    for (const [k, e] of this.texts) if (now - e.lastUsed > GC_MS) (e.texture.destroy(), this.texts.delete(k), this.textEpochs.delete(k));
    for (const [k, v] of this.videos) if (now - v.lastUsed > GC_MS) this.disposeVideo(k, v);
    for (const [k, l] of this.logos) if (l && now - l.lastUsed > GC_MS) (l.color.texture.destroy(), l.data.texture.destroy(), this.logos.delete(k));
    this.pairGroups.clear();
  }

  /** Drops cached textures of an asset (e.g. after it was removed from the library). */
  forget(assetId: string): void {
    const e = this.images.get(assetId);
    if (e) (e.texture.destroy(), this.images.delete(assetId));
    for (const [k, v] of this.videos) if (v.assetId === assetId) this.disposeVideo(k, v);
    for (const [k, l] of this.logos) if (k.startsWith(`${assetId}|`)) (l?.color.texture.destroy(), l?.data.texture.destroy(), this.logos.delete(k));
    this.pairGroups.clear();
  }

  dispose(): void {
    for (const e of this.images.values()) e.texture.destroy();
    for (const e of this.texts.values()) e.texture.destroy();
    for (const l of this.logos.values()) (l?.color.texture.destroy(), l?.data.texture.destroy());
    for (const e of this.blurred.values()) e.texture.destroy();
    for (const [k, v] of this.videos) this.disposeVideo(k, v);
    this.images.clear();
    this.texts.clear();
  }
}
