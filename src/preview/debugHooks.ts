/**
 * Development-only helpers exposed on `window.__facade` for inspecting GPU
 * output at full resolution (used together with the Vite debug middleware).
 * Tasks: export, view, snapshot(s), bench, importUrl, loadPreset.
 */
import { compileFrame } from "../procedural/compile";
import { presetToDocument } from "../presets/normalize";
import { builtInPresets } from "../presets/registry";
import type { Renderer } from "../renderer/types";
import { useApp, type ViewState } from "../state/store";
import { usePreviewStats } from "./stats";
import { runExport, type ExportSettings } from "../export/exporter";
import type { PresetDef } from "../presets/types";
import { importAsset, removeAsset, useAssets } from "../assets/assets";

function docFor(o: SnapshotOptions) {
  if (o.preset) return presetToDocument(o.preset);
  const preset = o.presetId ? builtInPresets().find((p) => p.id === o.presetId) : null;
  return preset ? presetToDocument(preset) : useApp.getState().doc;
}

interface SnapshotOptions {
  name?: string;
  presetId?: string;
  /** Inline preset JSON (iterate on looks without touching the library). */
  preset?: PresetDef;
  width?: number;
  height?: number;
  phase?: number;
  /** Render the stack only up to this layer id. */
  upTo?: string;
  /** Close-up of a UV window (u0, v0, u1, v1; v down) at width × height. */
  window?: [number, number, number, number];
}

export function installDebugHooks(renderer: Renderer): void {
  const snapshot = async (o: SnapshotOptions = {}) => {
    const preset = o.preset ?? (o.presetId ? builtInPresets().find((p) => p.id === o.presetId) : null);
    const doc = docFor(o);
    const w = o.width ?? doc.output.width;
    const h = o.height ?? doc.output.height;
    const phase = o.phase ?? 0.25;
    const t0 = performance.now();
    const frame = compileFrame(doc, w, h, { phase, seconds: phase * doc.animation.duration }, o.upTo, { window: o.window });
    const img = await renderer.renderThumbnail(frame, doc.look.exposure + Math.log2(Math.max(doc.look.emission, 1e-3)), doc.look.tonemap);
    const ms = performance.now() - t0;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const res = await fetch(`/__debug/snapshot?name=${encodeURIComponent(o.name ?? preset?.id ?? "current")}`, { method: "POST", body: blob });
    return { file: await res.text(), ms: Math.round(ms) };
  };

  /** Contact sheet: the same view at several loop phases, in a grid. */
  const sheet = async (o: SnapshotOptions & { phases: number[]; cols?: number }) => {
    const doc = docFor(o);
    const w = o.width ?? 512;
    const h = o.height ?? 256;
    const cols = o.cols ?? Math.min(4, o.phases.length);
    const rows = Math.ceil(o.phases.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cols * w + (cols - 1) * 4;
    canvas.height = rows * h + (rows - 1) * 4;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let k = 0; k < o.phases.length; k++) {
      const phase = o.phases[k];
      const frame = compileFrame(doc, w, h, { phase, seconds: phase * doc.animation.duration }, o.upTo, { window: o.window });
      if (frame.layers.some((l) => l.media)) await renderer.prepare(frame, "thumb");
      const img = await renderer.renderThumbnail(frame, doc.look.exposure + Math.log2(Math.max(doc.look.emission, 1e-3)), doc.look.tonemap);
      ctx.putImageData(img, (k % cols) * (w + 4), Math.floor(k / cols) * (h + 4));
    }
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const res = await fetch(`/__debug/snapshot?name=${encodeURIComponent(o.name ?? "sheet")}`, { method: "POST", body: blob });
    return await res.text();
  };

  /** Measures raw GPU throughput of the layer stack at a given size. */
  const bench = async (width = 1024, height = 2048, frames = 60) => {
    const doc = useApp.getState().doc;
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) {
      renderer.render(compileFrame(doc, width, height, { phase: k / frames, seconds: 0 }), "bench");
    }
    await renderer.renderThumbnail(compileFrame(doc, 16, 16, { phase: 0, seconds: 0 }), 0, "agx"); // GPU sync point
    const ms = (performance.now() - t0) / frames;
    return { msPerFrame: +ms.toFixed(2), fps: Math.round(1000 / ms) };
  };

  const loadPresetId = (id: string) => {
    const p = builtInPresets().find((x) => x.id === id);
    if (!p) throw new Error(`no preset ${id}`);
    useApp.getState().loadPreset(p);
  };
  (window as unknown as { __facade: unknown }).__facade = { renderer, importAsset, removeAsset, snapshot, sheet, bench, store: useApp, loadPresetId, presetIds: () => builtInPresets().map((p) => p.id) };

  // ?demo=<name>: a ready-made scene for documentation screenshots (headless browser).
  const demo = new URLSearchParams(location.search).get("demo");
  if (demo) void setTimeout(() => runDemo(), 300);
  function runDemo() {
    const s = () => useApp.getState();
    const q = new URLSearchParams(location.search);
    loadPresetId(q.get("preset") ?? "kanji-monolith");
    s().patchView({ mode: "2d", fit: true });
    if (q.get("select")) s().selectLayer(q.get("select"));
    if (q.get("modal")) s().setModal(q.get("modal") as "export");
    s().setPlaying(false);
    const scroll = q.get("scroll");
    if (scroll) setTimeout(() => document.querySelector(scroll)?.scrollIntoView({ block: "start" }), 1500);
  }

  // Dev task channel (see vite.config.ts): lets a test harness drive the running app.
  const runTask = async (task: { type: string; presetId?: string; settings?: Partial<ExportSettings> }) => {
    if (task.presetId && task.type !== "snapshot" && task.type !== "snapshots" && task.type !== "loadPreset") {
      const p = builtInPresets().find((x) => x.id === task.presetId);
      if (p) useApp.getState().loadPreset(p);
    }
    if (task.type === "export") {
      const doc = useApp.getState().doc;
      const settings: ExportSettings = {
        folder: "",
        baseName: doc.name,
        width: doc.output.width,
        height: doc.output.height,
        fps: 30,
        still: false,
        stillSeconds: 0,
        color: true,
        emission: true,
        mask: true,
        alpha: true,
        emissionFormat: "exr",
        maskFormat: "png",
        video: "none",
        videoMbps: 30,
        ...task.settings,
      };
      let frames = 0;
      const summary = await runExport(renderer, doc, settings, (p) => (frames = p.frame), new AbortController().signal);
      return { ...summary, lastProgressFrame: frames };
    }
    if (task.type === "snapshot") return snapshot(task as SnapshotOptions);
    if (task.type === "snapshots") {
      const t = task as unknown as { items: SnapshotOptions[] };
      const out = [];
      for (const it of t.items) out.push(await snapshot(it));
      return out;
    }
    if (task.type === "view") {
      const t = task as unknown as { view?: Partial<ViewState> };
      if (t.view) useApp.getState().patchView(t.view);
      return "ok";
    }
    if (task.type === "bench") return bench();
    if (task.type === "importUrl") {
      const t = task as unknown as { url: string; name: string };
      const blob = await (await fetch(t.url)).blob();
      return importAsset(blob, t.name, blob.type);
    }
    if (task.type === "scroll") {
      const t = task as unknown as { selector: string; block?: ScrollLogicalPosition };
      document.querySelector(t.selector)?.scrollIntoView({ block: t.block ?? "start" });
      return "ok";
    }
    if (task.type === "modal") {
      const t = task as unknown as { modal: "export" | "savePreset" | null };
      useApp.getState().setModal(t.modal);
      return "ok";
    }
    if (task.type === "removeAssets") {
      const t = task as unknown as { ids: string[] };
      for (const id of t.ids) await removeAsset(id);
      return Object.keys(useAssets.getState().assets);
    }
    if (task.type === "loadPreset") {
      const t = task as unknown as { preset?: PresetDef; presetId?: string; select?: string };
      const p = t.preset ?? builtInPresets().find((x) => x.id === t.presetId);
      if (p) useApp.getState().loadPreset(p);
      if (t.select) useApp.getState().selectLayer(t.select);
      return "ok";
    }
    throw new Error(`unknown task ${task.type}`);
  };
  setInterval(async () => {
    const runtime = "__TAURI_INTERNALS__" in window ? "tauri" : "browser";
    const res = await fetch(`/__debug/task?runtime=${runtime}`).catch(() => null);
    if (!res || res.status !== 200) return;
    const task = await res.json();
    const t0 = performance.now();
    let result: unknown;
    try {
      result = { ok: true, value: await runTask(task) };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) };
    }
    await fetch("/__debug/result", { method: "POST", body: JSON.stringify({ task, ms: Math.round(performance.now() - t0), result }, null, 2) });
  }, 1500);

  // Boot report: proves which runtime/GPU the app initialized on (e.g. inside the Tauri WebView2).
  setTimeout(async () => {
    const report = {
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      tauri: "__TAURI_INTERNALS__" in window,
      renderer: renderer.info,
      bootMs: (window as unknown as { __bootMs?: number }).__bootMs,
      visible: document.visibilityState,
      previewFps: +usePreviewStats.getState().fps.toFixed(1),
      previewRender: `${usePreviewStats.getState().renderWidth}x${usePreviewStats.getState().renderHeight}`,
      bench1024x2048: await bench(1024, 2048, 60),
      bench4096: await bench(4096, 4096, 10),
    };
    await fetch("/__debug/log", { method: "POST", body: JSON.stringify(report, null, 2) }).catch(() => {});
  }, 5000);
}
