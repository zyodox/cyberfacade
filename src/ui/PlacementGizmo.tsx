import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useAssets } from "../assets/assets";
import { layerRect } from "./placement";
import type { LayerInstance } from "../procedural/types";
import { useApp } from "../state/store";

/** Placement rectangle in building space (x right, y up): centre and size. */
function placement(layer: LayerInstance, outW: number, outH: number) {
  // Unsnapped on purpose: the handles show what the parameters say.
  return layerRect({ ...layer, params: { ...layer.params, snap: false } }, outW / outH);
}

type Drag = { mode: "move" | "corner"; x: number; y: number; start: Record<string, number> };

/** Drag / resize handles for image, video and sign layers over the 2D preview. */
export function PlacementGizmo() {
  const wrap = useRef<HTMLDivElement>(null);
  const [css, setCss] = useState({ w: 1, h: 1 });
  const view = useApp((s) => s.view);
  const output = useApp((s) => s.doc.output);
  const layer = useApp((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId) ?? null);
  useAssets((s) => s.version);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = wrap.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCss({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rect = useMemo(() => (layer && layer.enabled ? placement(layer, output.width, output.height) : null), [layer, output.width, output.height]);
  if (!layer || !rect || view.mode !== "2d" || view.tile) return <div ref={wrap} className="gizmo-layer" />;

  const sx = view.scale * output.width;
  const sy = view.scale * output.height;
  const left = css.w / 2 + (rect.cx - rect.w / 2 - view.center[0]) * sx;
  const top = css.h / 2 + (1 - (rect.cy + rect.h / 2) - view.center[1]) * sy;
  const width = rect.w * sx;
  const height = rect.h * sy;
  const sizeKey = layer.generator === "sign" ? "size" : "sizeW";

  const begin = (mode: Drag["mode"]) => (e: RPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = layer.params;
    drag.current = {
      mode,
      x: e.clientX,
      y: e.clientY,
      start: { posX: p.posX as number, posY: p.posY as number, size: (p[sizeKey] as number) ?? 0, sizeH: (p.sizeH as number) ?? 0, w: rect.w, h: rect.h },
    };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useApp.getState();
    const dx = (e.clientX - d.x) / sx;
    const dy = -(e.clientY - d.y) / sy;
    if (d.mode === "move") {
      s.setParam(layer.id, "posX", +(d.start.posX + dx).toFixed(4));
      s.setParam(layer.id, "posY", +(d.start.posY + dy).toFixed(4));
      return;
    }
    // Corner: resize about the centre.
    const r = wrap.current!.getBoundingClientRect();
    const cxS = r.left + css.w / 2 + (d.start.posX - view.center[0]) * sx;
    const cyS = r.top + css.h / 2 + (1 - d.start.posY - view.center[1]) * sy;
    const hw = Math.abs(e.clientX - cxS) / sx;
    const hh = Math.abs(e.clientY - cyS) / sy;
    if (rect.uniform) {
      const f = Math.max(hw / Math.max(d.start.w / 2, 1e-5), hh / Math.max(d.start.h / 2, 1e-5));
      s.setParam(layer.id, sizeKey, +Math.max(0.004, d.start.size * f).toFixed(4));
    } else {
      s.setParam(layer.id, "sizeW", +Math.max(0.005, hw * 2).toFixed(4));
      s.setParam(layer.id, "sizeH", +Math.max(0.005, hh * 2).toFixed(4));
    }
  };
  const end = (e: RPointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div ref={wrap} className="gizmo-layer">
      <div className="gizmo" style={{ left, top, width, height }}>
        <span className="gizmo-tag">{layer.name}</span>
        {(["n", "s", "e", "w"] as const).map((side) => (
          <div key={side} className={`gizmo-edge ${side}`} onPointerDown={begin("move")} {...handlers} title="Drag to move" />
        ))}
        <div className="gizmo-move" onPointerDown={begin("move")} {...handlers} title="Drag to move" />
        {(["nw", "ne", "sw", "se"] as const).map((c) => (
          <div key={c} className={`gizmo-corner ${c}`} onPointerDown={begin("corner")} {...handlers} title="Drag to resize" />
        ))}
      </div>
    </div>
  );
}
