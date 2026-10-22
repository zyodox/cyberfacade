import { clock, loopPhase } from "../animation/clock";
import { audioEngine, useAudio } from "../audio/engine";
import { applyAudio } from "../audio/modulation";
import type { OrbitCamera } from "../preview3d/mat4";
import { FrameCompiler } from "../procedural/compile";
import type { FacadeDocument } from "../procedural/types";
import type { FrameHandle, Renderer, RenderView, Scene3DView } from "../renderer/types";
import { useApp, type AppState } from "../state/store";
import { usePreviewStats } from "./stats";

const INTERACTIVE_LONG_SIDE = 1024;
const IDLE_DELAY_MS = 280;
const QUALITY_CAP: Record<string, number> = { "512": 512, "1024": 1024, "2048": 2048 };
const DEFAULT_CAMERA: OrbitCamera = { yaw: 0.55, pitch: 0.12, distance: 2.35, targetY: 0.55, fovDeg: 38 };

/** Auto skin: matte if the design is made of concrete, glass otherwise. */
export function resolveSurface(surface: "auto" | "glass" | "concrete", doc: FacadeDocument): "glass" | "concrete" {
  if (surface !== "auto") return surface;
  return doc.layers.some((l) => l.enabled && l.generator === "concrete") ? "concrete" : "glass";
}

/**
 * Drives the preview: advances the clock, decides the texture render
 * resolution (low-res proxy while playing/editing, refined when idle), renders
 * through the backend-agnostic Renderer and presents either the 2D texture
 * view or the 3D preview (the texture on a building primitive — view only).
 * React only mounts/unmounts it.
 */
export class PreviewController {
  private readonly view: RenderView;
  private scene: Scene3DView | null = null;
  private cam: OrbitCamera = { ...DEFAULT_CAMERA };
  private lastCameraReset = 0;
  private frameChanged = true;
  private readonly compiler = new FrameCompiler();
  private readonly ro: ResizeObserver;
  private readonly unsubs: (() => void)[] = [];
  private raf = 0;
  private lastTick = performance.now();
  private lastEdit = 0;
  private dirty = true;
  private presentDirty = true;
  private handle: FrameHandle | null = null;
  private renderedKey = "";
  private css = { w: 1, h: 1, dpr: 1 };
  private fpsFrames = 0;
  private fpsT0 = performance.now();
  private drag: { x: number; y: number; cx: number; cy: number; button: number; cam: OrbitCamera; moved: boolean } | null = null;

  constructor(
    private readonly renderer: Renderer,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.view = renderer.createView(canvas);

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(canvas);
    this.handleResize();

    this.unsubs.push(
      useApp.subscribe((s, prev) => {
        if (s.doc !== prev.doc) {
          this.dirty = true;
          this.lastEdit = performance.now();
          if (s.doc.output !== prev.doc.output && s.view.fit) this.fit(s);
        }
        if (s.view !== prev.view) {
          this.presentDirty = true;
          if (s.view.mode !== prev.view.mode || s.view.previewUpTo !== prev.view.previewUpTo) this.dirty = true;
          if (s.view.fit && (!prev.view.fit || s.view.tile !== prev.view.tile)) this.fit(s);
        }
        if (s.view3d !== prev.view3d) this.presentDirty = true;
        if (s.playing !== prev.playing) audioEngine.setPlaying(s.playing);
      }),
      clock.subscribe(() => {
        this.dirty = true;
      }),
      // Decoded images, seeked video frames and loaded fonts arrive asynchronously.
      renderer.onMediaChange(() => {
        this.dirty = true;
      }),
    );

    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("contextmenu", this.onContextMenu);

    this.raf = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unsubs.forEach((u) => u());
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.scene?.dispose();
    this.view.dispose();
  }

  private is3D(): boolean {
    return useApp.getState().view.mode === "3d";
  }

  // ---------------------------------------------------------------------------

  private handleResize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.css = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr: window.devicePixelRatio || 1 };
    this.view.resize(this.css.w, this.css.h, this.css.dpr);
    this.scene?.resize(this.css.w, this.css.h, this.css.dpr);
    const s = useApp.getState();
    if (s.view.fit) this.fit(s);
    this.presentDirty = true;
  }

  private fit(s: AppState): void {
    const { width, height } = s.doc.output;
    const cols = s.view.tile ? 3 : 1;
    const scale = Math.min(this.css.w / (width * cols), this.css.h / height) * 0.94;
    const v = s.view;
    if (v.scale !== scale || v.center[0] !== 0.5 || v.center[1] !== 0.5 || !v.fit) {
      s.patchView({ scale, center: [0.5, 0.5], fit: true });
    }
  }

  /** Texture render size: capped while interacting, never finer than the screen shows. */
  private renderSize(s: AppState, interacting: boolean): { w: number; h: number } {
    const { width: ow, height: oh } = s.doc.output;
    const long = Math.max(ow, oh);
    let f = s.view.mode === "3d" || s.view.quality === "full" ? 1 : Math.min(1, s.view.scale * this.css.dpr * 1.15);
    const cap = QUALITY_CAP[s.view.quality];
    if (cap) f = Math.min(f, cap / long);
    else if (s.view.quality === "auto" && interacting) f = Math.min(f, INTERACTIVE_LONG_SIDE / long);
    f = Math.min(f, this.renderer.info.maxTextureSize / long);
    return { w: Math.max(16, Math.round(ow * f)), h: Math.max(16, Math.round(oh * f)) };
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const s = useApp.getState();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;

    const duration = s.doc.animation.duration;
    if (s.playing) {
      let t = clock.time + dt;
      if (t >= duration) {
        if (s.loop) t %= duration;
        else {
          t = duration;
          s.setPlaying(false);
        }
      }
      clock.set(t);
    }

    // The node graph has its own thumbnails; the main canvas is hidden meanwhile.
    if (s.view.mode === "graph") return;
    const three = s.view.mode === "3d";
    const interacting = s.playing || now - this.lastEdit < IDLE_DELAY_MS || (this.drag !== null && !three);

    // Audio-reactive routes need a fresh frame whenever sound is flowing.
    const audioLive = s.doc.audio.routes.length > 0 && audioEngine.active && (s.playing || useAudio.getState().source === "mic");
    if (audioLive) this.dirty = true;
    const seconds = Math.min(clock.time, duration);
    const time = { phase: loopPhase(seconds, duration), seconds };

    const size = this.renderSize(s, interacting);
    const key = `${size.w}x${size.h}`;
    if (this.dirty || key !== this.renderedKey) {
      const doc = audioEngine.active && s.doc.audio.routes.length ? applyAudio(s.doc, audioEngine.bands()) : s.doc;
      const frame = this.compiler.compile(doc, size.w, size.h, time, s.view.previewUpTo);
      this.handle = this.renderer.render(frame, interacting ? "interactive" : "idle", { live: s.playing, mediaSlot: "preview" });
      this.renderedKey = key;
      this.dirty = false;
      this.presentDirty = true;
      this.frameChanged = true;
      usePreviewStats.setState({ renderWidth: size.w, renderHeight: size.h, mode: interacting ? "interactive" : "full" });
    }

    if (three) {
      if (!this.scene) {
        this.scene = this.renderer.createScene3D(this.canvas);
        this.scene.resize(this.css.w, this.css.h, this.css.dpr);
        this.frameChanged = true;
      }
      const v3 = s.view3d;
      if (v3.cameraReset !== this.lastCameraReset) {
        this.lastCameraReset = v3.cameraReset;
        this.cam = { ...DEFAULT_CAMERA, fovDeg: v3.fov };
        this.presentDirty = true;
      }
      if (v3.autoRotate && !this.drag) {
        this.cam.yaw += dt * 0.12;
        this.presentDirty = true;
      }
      if (this.presentDirty) {
        this.scene.render(this.handle, this.frameChanged, {
          primitive: v3.primitive,
          texAspect: s.doc.output.width / s.doc.output.height,
          facades: s.doc.architecture.facades,
          matchAspect: v3.matchAspect,
          camera: { ...this.cam, fovDeg: v3.fov },
          emission: s.doc.look.emission,
          exposure: s.doc.look.exposure + v3.exposure,
          tonemap: s.doc.look.tonemap,
          bloom: v3.bloom,
          bloomThreshold: v3.bloomThreshold,
          bloomRadius: v3.bloomRadius,
          reflections: v3.reflections,
          fog: v3.fog,
          haze: v3.haze,
          rain: v3.rain,
          environment: v3.environment,
          surface: resolveSurface(v3.surface, s.doc),
          sky: v3.sky,
          seconds: now / 1000,
        });
        this.frameChanged = false;
        this.presentDirty = false;
        this.fpsFrames++;
      }
    } else if (this.presentDirty) {
      const v = s.view;
      this.view.present(this.handle, {
        outputSize: [s.doc.output.width, s.doc.output.height],
        scale: v.scale,
        center: v.center,
        emission: s.doc.look.emission,
        exposure: s.doc.look.exposure,
        tonemap: s.doc.look.tonemap,
        channel: v.channel,
        tile: v.tile,
      });
      this.presentDirty = false;
      this.fpsFrames++;
    }

    const elapsed = now - this.fpsT0;
    if (elapsed >= 500) {
      usePreviewStats.setState({ fps: (this.fpsFrames * 1000) / elapsed });
      this.fpsFrames = 0;
      this.fpsT0 = now;
    }
  };

  // --- Interaction: 2D pan / zoom, 3D orbit / dolly / height / pan ----------------------------

  private cursorUv(e: { clientX: number; clientY: number }, s: AppState): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const { width, height } = s.doc.output;
    const dx = e.clientX - r.left - r.width / 2;
    const dy = e.clientY - r.top - r.height / 2;
    return [s.view.center[0] + dx / (s.view.scale * width), s.view.center[1] + dy / (s.view.scale * height)];
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.is3D()) {
      this.cam.distance = Math.min(12, Math.max(0.05, this.cam.distance * Math.exp(e.deltaY * 0.0012)));
      this.presentDirty = true;
      return;
    }
    const s = useApp.getState();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(32, Math.max(0.02, s.view.scale * factor));
    const [u, v] = this.cursorUv(e, s);
    const r = this.canvas.getBoundingClientRect();
    const { width, height } = s.doc.output;
    const dx = e.clientX - r.left - r.width / 2;
    const dy = e.clientY - r.top - r.height / 2;
    s.patchView({ scale, fit: false, center: [u - dx / (scale * width), v - dy / (scale * height)] });
    this.lastEdit = performance.now();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button > 2) return;
    const s = useApp.getState();
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, cx: s.view.center[0], cy: s.view.center[1], button: e.button, cam: { ...this.cam }, moved: false };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    if (this.is3D()) {
      const c0 = this.drag.cam;
      if (this.drag.button === 1 || (this.drag.button === 0 && e.shiftKey)) {
        // Pan: move the look-at point across the view.
        const k = (c0.distance * 1.1) / this.css.h;
        this.cam.panX = (c0.panX ?? 0) - Math.cos(c0.yaw) * dx * k;
        this.cam.panZ = (c0.panZ ?? 0) + Math.sin(c0.yaw) * dx * k;
        this.cam.targetY = Math.min(1.5, Math.max(-0.2, c0.targetY + dy * k));
      } else if (this.drag.button === 0) {
        this.cam.yaw = c0.yaw - dx * 0.006;
        this.cam.pitch = Math.min(1.45, Math.max(-0.05, c0.pitch + dy * 0.004));
      } else {
        // Right-drag: move the look-at point up and down the building.
        this.cam.targetY = Math.min(1.5, Math.max(-0.2, c0.targetY + (dy / this.css.h) * c0.distance));
      }
      this.presentDirty = true;
      return;
    }
    const s = useApp.getState();
    const { width, height } = s.doc.output;
    s.patchView({ center: [this.drag.cx - dx / (s.view.scale * width), this.drag.cy - dy / (s.view.scale * height)], fit: false });
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.drag = null;
    this.lastEdit = performance.now();
  };

  private onDoubleClick = (): void => {
    if (this.is3D()) {
      this.cam = { ...DEFAULT_CAMERA, fovDeg: useApp.getState().view3d.fov };
      this.presentDirty = true;
    } else useApp.getState().patchView({ fit: true });
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
