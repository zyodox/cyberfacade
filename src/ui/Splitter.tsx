import { useRef } from "react";

export interface PanelWidths {
  left: number;
  right: number;
}

const KEY = "facade-studio.panel-widths";
export const DEFAULT_WIDTHS: PanelWidths = { left: 300, right: 360 };
/** Narrower than min (but not collapsed) snaps back to min; dragging well past it collapses the panel. */
const LIMITS = { left: { min: 220, max: 620 }, right: { min: 280, max: 640 } };
const COLLAPSE_BELOW = 120;

export function loadPanelWidths(): PanelWidths {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PanelWidths>;
    const ok = (n: unknown, side: keyof PanelWidths) => (typeof n === "number" && (n === 0 || (n >= LIMITS[side].min && n <= LIMITS[side].max)) ? n : DEFAULT_WIDTHS[side]);
    return { left: ok(v.left, "left"), right: ok(v.right, "right") };
  } catch {
    return { ...DEFAULT_WIDTHS };
  }
}

function savePanelWidths(w: PanelWidths): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* private mode */
  }
}

function clampWidth(side: keyof PanelWidths, w: number): number {
  if (w < COLLAPSE_BELOW) return 0;
  return Math.round(Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, w)));
}

/** CSS custom properties the app grid reads its side-panel widths from. */
export function panelWidthVars(w: PanelWidths): Record<string, string> {
  return { "--left-w": `${w.left}px`, "--right-w": `${w.right}px` };
}

/**
 * Drag handle between a side panel and the preview. While dragging, the grid
 * width is written straight to the app element (no React re-render per move);
 * the final width is committed and remembered on release. Double-click resets.
 */
export function Splitter({ side, widths, onChange }: { side: keyof PanelWidths; widths: PanelWidths; onChange(w: PanelWidths): void }) {
  const drag = useRef<{ x: number; w: number; app: HTMLElement; last: number; moved: boolean } | null>(null);
  const collapsed = widths[side] === 0;

  const commit = (w: number) => {
    const next = { ...widths, [side]: w };
    savePanelWidths(next);
    onChange(next);
  };

  return (
    <div
      className={`splitter ${side}${collapsed ? " collapsed" : ""}`}
      title={collapsed ? "Click or drag to reopen the panel" : "Drag to resize · double-click: default width · drag closed to hide"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const app = (e.currentTarget as HTMLElement).closest(".app") as HTMLElement | null;
        if (!app) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety; dragging still works while over the handle */
        }
        drag.current = { x: e.clientX, w: widths[side], app, last: widths[side], moved: false };
        document.body.classList.add("resizing");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 3) d.moved = true;
        const w = clampWidth(side, d.w + (side === "left" ? dx : -dx));
        if (w === d.last) return;
        d.last = w;
        d.app.style.setProperty(side === "left" ? "--left-w" : "--right-w", `${w}px`);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove("resizing");
        // A plain click on a collapsed panel's tab reopens it.
        commit(!d.moved && collapsed ? DEFAULT_WIDTHS[side] : d.last);
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.body.classList.remove("resizing");
      }}
      onDoubleClick={() => commit(DEFAULT_WIDTHS[side])}
    >
      <span className="splitter-grip" />
    </div>
  );
}
