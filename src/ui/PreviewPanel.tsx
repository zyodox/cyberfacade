import { useEffect, useRef, useState } from "react";
import { PRIMITIVE_LABELS, PRIMITIVES, type Primitive } from "../preview3d/geometry";
import { PreviewController } from "../preview/PreviewController";
import { usePreviewStats } from "../preview/stats";
import type { PreviewChannel } from "../renderer/types";
import { useApp, type PreviewQuality } from "../state/store";
import { SelectField, Slider, ToggleField } from "./controls";
import { IconFit, IconLoop, IconReset, IconTile } from "./icons";
import { NodeGraph } from "./NodeGraph";
import { PlacementGizmo } from "./PlacementGizmo";
import { ErrorBoundary } from "./ErrorBoundary";
import { useRenderServices } from "./RendererContext";

const channels: { id: PreviewChannel; label: string; hint: string }[] = [
  { id: "color", label: "Color", hint: "Tonemapped color" },
  { id: "emission", label: "Emission", hint: "HDR emission false-color (−6…+6 EV)" },
  { id: "mask", label: "Mask", hint: "Feature coverage mask" },
  { id: "alpha", label: "Alpha", hint: "Emission-derived alpha" },
];

const qualities: { id: PreviewQuality; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "512", label: "≤ 512" },
  { id: "1024", label: "≤ 1024" },
  { id: "2048", label: "≤ 2048" },
  { id: "full", label: "Full res" },
];

export function PreviewPanel() {
  const { renderer } = useRenderServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useApp((s) => s.view);
  const view3d = useApp((s) => s.view3d);
  const output = useApp((s) => s.doc.output);
  const { patchView, patchView3D } = useApp.getState();
  const [sceneOpen, setSceneOpen] = useState(false);
  const is3D = view.mode === "3d";
  const isGraph = view.mode === "graph";
  const soloName = useApp((s) => s.doc.layers.find((l) => l.id === s.view.previewUpTo)?.name ?? "");

  useEffect(() => {
    const controller = new PreviewController(renderer, canvasRef.current!);
    return () => controller.dispose();
  }, [renderer]);

  return (
    <main className="preview">
      <div className="preview-toolbar">
        <div className="tabs">
          <button className={`tab${view.mode === "2d" ? " active" : ""}`} onClick={() => patchView({ mode: "2d" })}>
            Texture
          </button>
          <button className={`tab${is3D ? " active" : ""}`} onClick={() => patchView({ mode: "3d" })} title="Preview the texture on a building (view only)">
            3D
          </button>
          <button className={`tab${isGraph ? " active" : ""}`} onClick={() => patchView({ mode: "graph" })} title="Advanced node view of the layer pipeline">
            Graph
          </button>
        </div>
        {view.previewUpTo && !isGraph ? (
          <button className="solo-chip" onClick={() => patchView({ previewUpTo: null })} title="Show the full stack again">
            Viewing up to “{soloName}” ✕
          </button>
        ) : null}
        {isGraph ? (
          <span className="hint">Advanced mode · Generator → Mask → Modifier → Animation → Color → Emission</span>
        ) : is3D ? (
          <>
            <select value={view3d.primitive} onChange={(e) => patchView3D({ primitive: e.target.value as Primitive })} title="Building shape the texture is shown on">
              {PRIMITIVES.map((p) => (
                <option key={p} value={p}>
                  {PRIMITIVE_LABELS[p]}
                </option>
              ))}
            </select>
            <button className={`tool-btn${view3d.autoRotate ? " active" : ""}`} title="Auto-rotate" onClick={() => patchView3D({ autoRotate: !view3d.autoRotate })}>
              <IconLoop /> Orbit
            </button>
            <button className="tool-btn" title="Reset camera (double-click canvas)" onClick={() => patchView3D({ cameraReset: view3d.cameraReset + 1 })}>
              <IconReset /> Camera
            </button>
            <button className={`tool-btn${sceneOpen ? " active" : ""}`} onClick={() => setSceneOpen(!sceneOpen)}>
              Scene…
            </button>
            <span className="hint">drag orbit · right-drag height · wheel zoom</span>
          </>
        ) : (
          <>
            <div className="segmented">
              {channels.map((c) => (
                <button key={c.id} className={view.channel === c.id ? "active" : ""} title={c.hint} onClick={() => patchView({ channel: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
            <button className={`tool-btn${view.tile ? " active" : ""}`} title="Tile horizontally to check the seamless wrap" onClick={() => patchView({ tile: !view.tile, fit: true })}>
              <IconTile /> Tile
            </button>
            <button className="tool-btn" title="Fit (double-click canvas)" onClick={() => patchView({ fit: true })}>
              <IconFit /> Fit
            </button>
            <button className="tool-btn" title="1 texture pixel = 1 screen pixel" onClick={() => patchView({ fit: false, scale: 1 / (window.devicePixelRatio || 1) })}>
              1:1
            </button>
            <span className="zoom-readout">{Math.round(view.scale * (window.devicePixelRatio || 1) * 100)}%</span>
          </>
        )}
        <label className="inline-select" title="Texture render resolution">
          Res
          <select value={view.quality} onChange={(e) => patchView({ quality: e.target.value as PreviewQuality })}>
            {qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <Stats outputW={output.width} outputH={output.height} />
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} className={`preview-canvas${is3D ? " orbit" : ""}`} style={isGraph ? { visibility: "hidden" } : undefined} />
        {isGraph ? <NodeGraph /> : null}
        {view.mode === "2d" ? (
          <ErrorBoundary name="Placement handles">
            <PlacementGizmo />
          </ErrorBoundary>
        ) : null}
        {is3D && sceneOpen ? (
          <div className="scene-panel">
            <div className="scene-panel-title">Scene</div>
            <ToggleField label="Match texture proportions" value={view3d.matchAspect} onChange={(v) => patchView3D({ matchAspect: v })} />
            <SelectField
              label="Building skin"
              value={view3d.surface}
              options={[
                { id: "auto", label: "Auto (matte if concrete)" },
                { id: "glass", label: "Glass (reflective)" },
                { id: "concrete", label: "Concrete (matte)" },
              ]}
              onChange={(v) => patchView3D({ surface: v })}
            />
            <SelectField
              label="Sky"
              value={view3d.sky}
              options={[
                { id: "bluehour", label: "Blue hour" },
                { id: "night", label: "Deep night" },
              ]}
              onChange={(v) => patchView3D({ sky: v })}
            />
            <Slider label="Bloom" value={view3d.bloom} min={0} max={3} onChange={(v) => patchView3D({ bloom: v })} />
            <Slider label="Bloom threshold" value={view3d.bloomThreshold} min={0} max={4} onChange={(v) => patchView3D({ bloomThreshold: v })} />
            <Slider label="Bloom radius" value={view3d.bloomRadius} min={0} max={1.5} onChange={(v) => patchView3D({ bloomRadius: v })} />
            <Slider label="Wet reflections" value={view3d.reflections} min={0} max={1} onChange={(v) => patchView3D({ reflections: v })} />
            <Slider label="Fog" value={view3d.fog} min={0} max={3} onChange={(v) => patchView3D({ fog: v })} />
            <Slider label="Lit haze" value={view3d.haze} min={0} max={3} onChange={(v) => patchView3D({ haze: v })} />
            <Slider label="Rain" value={view3d.rain} min={0} max={1} onChange={(v) => patchView3D({ rain: v })} />
            <Slider label="Environment" value={view3d.environment} min={0} max={4} onChange={(v) => patchView3D({ environment: v })} />
            <Slider label="Exposure" value={view3d.exposure} min={-4} max={4} unit="EV" onChange={(v) => patchView3D({ exposure: v })} />
            <Slider label="Field of view" value={view3d.fov} min={15} max={80} unit="°" onChange={(v) => patchView3D({ fov: v })} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Stats({ outputW, outputH }: { outputW: number; outputH: number }) {
  const stats = usePreviewStats();
  return (
    <div className="stats">
      <span title="Output resolution">
        {outputW}×{outputH}
      </span>
      <span className={`res-badge ${stats.mode}`} title={stats.mode === "full" ? "Idle: refined render" : "Interactive proxy resolution"}>
        {stats.renderWidth}×{stats.renderHeight}
      </span>
      <span className="fps">{stats.fps.toFixed(0)} fps</span>
    </div>
  );
}
