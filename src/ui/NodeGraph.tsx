import { useEffect, useRef, useState, type DragEvent } from "react";
import { clock, loopPhase } from "../animation/clock";
import { compileFrame } from "../procedural/compile";
import { getGenerator, listGenerators } from "../procedural/registry";
import type { FacadeDocument, GeneratorKind, LayerInstance } from "../procedural/types";
import { useApp } from "../state/store";
import { Slider } from "./controls";
import { IconEye, IconEyeOff, IconTrash } from "./icons";
import { useRenderServices } from "./RendererContext";

/** The canonical stage order of the simplified node flow. */
const STAGES: { kind: GeneratorKind; label: string }[] = [
  { kind: "generator", label: "Generator" },
  { kind: "mask", label: "Mask" },
  { kind: "modifier", label: "Modifier" },
  { kind: "animation", label: "Animation" },
  { kind: "color", label: "Color" },
  { kind: "emission", label: "Emission" },
];

const THUMB_W = 116;

/**
 * Renders "the stack up to node k" for every node on the GPU (tiny readbacks),
 * refreshed on edits and a few times per second while playing.
 */
function useStageThumbnails(doc: FacadeDocument): Map<string, ImageData> {
  const { renderer } = useRenderServices();
  const playing = useApp((s) => s.playing);
  const [thumbs, setThumbs] = useState(new Map<string, ImageData>());
  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const gen = ++generation.current;
    const run = async () => {
      const aspect = doc.output.height / doc.output.width;
      const w = THUMB_W;
      const h = Math.max(48, Math.min(240, Math.round(w * aspect)));
      const seconds = Math.min(clock.time, doc.animation.duration);
      const time = { phase: loopPhase(seconds, doc.animation.duration), seconds };
      const ev = doc.look.exposure + Math.log2(Math.max(doc.look.emission, 1e-3));
      const next = new Map<string, ImageData>();
      for (const layer of doc.layers) {
        if (cancelled || gen !== generation.current) return;
        next.set(layer.id, await renderer.renderThumbnail(compileFrame(doc, w, h, time, layer.id), ev, doc.look.tonemap));
      }
      if (!cancelled && gen === generation.current) setThumbs(next);
    };
    const debounce = setTimeout(run, 90);
    const timer = playing ? setInterval(run, 350) : null;
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      if (timer) clearInterval(timer);
    };
  }, [doc, playing, renderer]);

  return thumbs;
}

function Thumb({ image }: { image?: ImageData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(image, 0, 0);
  }, [image]);
  return <canvas ref={ref} className="node-thumb" />;
}

function InsertSlot({ index }: { index: number }) {
  const { addLayer } = useApp.getState();
  return (
    <label className="insert-slot" title="Insert a node here">
      +
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) addLayer(e.target.value, index);
        }}
      >
        <option value="" disabled>
          Insert node…
        </option>
        {STAGES.map((st) => {
          const gens = listGenerators().filter((g) => g.kind === st.kind);
          return gens.length ? (
            <optgroup key={st.kind} label={st.label}>
              {gens.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
}

function NodeCard({ layer, index, thumb, selected, solo }: { layer: LayerInstance; index: number; thumb?: ImageData; selected: boolean; solo: boolean }) {
  const def = getGenerator(layer.generator);
  const { selectLayer, patchLayer, removeLayer, moveLayerTo, patchView } = useApp.getState();
  const [dropSide, setDropSide] = useState<"before" | "after" | null>(null);
  const kind = def?.kind ?? "generator";

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-facade-layer")) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropSide(e.clientX < r.left + r.width / 2 ? "before" : "after");
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-facade-layer");
    if (id && id !== layer.id) moveLayerTo(id, dropSide === "after" ? index + 1 : index);
    setDropSide(null);
  };

  return (
    <div
      className={`node kind-${kind}${selected ? " selected" : ""}${layer.enabled ? "" : " bypassed"}${dropSide ? ` drop-${dropSide}` : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-facade-layer", layer.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropSide(null)}
      onDrop={onDrop}
      onClick={() => selectLayer(layer.id)}
      title="Click to edit · drag to reorder"
    >
      <div className="node-head">
        <span className="node-kind">{STAGES.find((s) => s.kind === kind)?.label}</span>
        <span className="node-blend">{layer.blend}</span>
      </div>
      <Thumb image={thumb} />
      <div className="node-title">{layer.name}</div>
      <div className="node-sub">
        {def?.label ?? layer.generator}
        {layer.opacity < 1 ? ` · ${Math.round(layer.opacity * 100)}%` : ""}
        {layer.clip ? " · clip" : ""}
      </div>
      <div className="node-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title={layer.enabled ? "Bypass" : "Enable"} onClick={() => patchLayer(layer.id, { enabled: !layer.enabled })}>
          {layer.enabled ? <IconEye /> : <IconEyeOff />}
        </button>
        <button className={`node-solo${solo ? " on" : ""}`} title="Show the result up to this node" onClick={() => patchView({ previewUpTo: solo ? null : layer.id })}>
          view here
        </button>
        <button className="icon-btn danger" title="Delete node" onClick={() => removeLayer(layer.id)}>
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

export function NodeGraph() {
  const doc = useApp((s) => s.doc);
  const selectedId = useApp((s) => s.selectedLayerId);
  const previewUpTo = useApp((s) => s.view.previewUpTo);
  const { patchLook, patchView } = useApp.getState();
  const thumbs = useStageThumbnails(doc);
  const last = doc.layers[doc.layers.length - 1];
  const counts = new Map<GeneratorKind, number>();
  for (const l of doc.layers) {
    const k = getGenerator(l.generator)?.kind ?? "generator";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return (
    <div className="graph">
      <div className="graph-legend">
        {STAGES.map((s, i) => (
          <span key={s.kind} className={`legend-item kind-${s.kind}`}>
            <i />
            {s.label}
            {counts.get(s.kind) ? <b>{counts.get(s.kind)}</b> : null}
            {i < STAGES.length - 1 ? <em>→</em> : null}
          </span>
        ))}
        <span className="graph-help">Nodes run left → right, top → bottom. Each node blends into everything before it.</span>
      </div>
      <div className="graph-flow">
        <InsertSlot index={0} />
        {doc.layers.map((l, i) => (
          <div className="node-wrap" key={l.id}>
            <NodeCard layer={l} index={i} thumb={thumbs.get(l.id)} selected={l.id === selectedId} solo={previewUpTo === l.id} />
            <span className="node-arrow">→</span>
            <InsertSlot index={i + 1} />
          </div>
        ))}
        <div className="node kind-emission output-node">
          <div className="node-head">
            <span className="node-kind">Emission output</span>
          </div>
          <Thumb image={last ? thumbs.get(last.id) : undefined} />
          <Slider label="Emission" value={doc.look.emission} min={0} max={8} onChange={(v) => patchLook({ emission: v })} />
          <Slider label="Exposure" value={doc.look.exposure} min={-6} max={6} unit="EV" onChange={(v) => patchLook({ exposure: v })} />
          <button className="btn" onClick={() => patchView({ mode: "2d" })}>
            View texture
          </button>
        </div>
      </div>
    </div>
  );
}
