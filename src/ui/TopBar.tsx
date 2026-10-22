import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { exportPresetFile, importPreset, openProject, saveProject } from "./fileActions";
import { redo, undo, useHistory } from "../state/history";
import { IconImport, IconLock, IconRedo, IconSave, IconSparkle, IconUndo, IconUnlock } from "./icons";
import { importAndPlace } from "./importActions";
import { useRenderServices } from "./RendererContext";

const SIZES: { label: string; w: number; h: number }[] = [
  { label: "512 × 512", w: 512, h: 512 },
  { label: "1024 × 1024", w: 1024, h: 1024 },
  { label: "1024 × 2048 · tower", w: 1024, h: 2048 },
  { label: "2048 × 2048", w: 2048, h: 2048 },
  { label: "2048 × 4096 · tower", w: 2048, h: 4096 },
  { label: "4096 × 4096", w: 4096, h: 4096 },
  { label: "2048 × 1024 · wide", w: 2048, h: 1024 },
  { label: "4096 × 1024 · wrap", w: 4096, h: 1024 },
  { label: "8192 × 2048 · wrap", w: 8192, h: 2048 },
  { label: "1920 × 1080 · HD", w: 1920, h: 1080 },
  { label: "1080 × 1920 · HD portrait", w: 1080, h: 1920 },
  { label: "3840 × 2160 · 4K UHD", w: 3840, h: 2160 },
];

/**
 * Pixel-size field that edits a draft: typing never fights the clamp. The value
 * is applied on Enter / blur (clamped to 16…max), Escape reverts, ↑/↓ step by
 * 16 (Shift: 128).
 */
function DimInput({ value, max, onCommit, title }: { value: number; max: number; onCommit(v: number): void; title: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(16, Math.min(max, Math.round(v)));
  const commit = () => {
    if (draft === null) return;
    const v = parseInt(draft.replace(/[^\d]/g, ""), 10);
    setDraft(null);
    if (Number.isFinite(v) && clamp(v) !== value) onCommit(clamp(v));
  };
  return (
    <input
      className="num-input dim"
      inputMode="numeric"
      title={`${title} in pixels (16–${max}). Enter to apply, Esc to cancel, ↑/↓ ±16, Shift ±128`}
      value={draft ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(null);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const step = (e.shiftKey ? 128 : 16) * (e.key === "ArrowUp" ? 1 : -1);
          const base = parseInt(draft ?? String(value), 10) || value;
          const v = clamp(base + step);
          setDraft(null);
          if (v !== value) onCommit(v);
        }
      }}
    />
  );
}

function OutputSize({ max }: { max: number }) {
  const output = useApp((s) => s.doc.output);
  const { patchOutput } = useApp.getState();
  const [lock, setLock] = useState(false);
  const sizes = SIZES.filter((s) => s.w <= max && s.h <= max);
  const match = sizes.find((s) => s.w === output.width && s.h === output.height);
  const clamp = (v: number) => Math.max(16, Math.min(max, Math.round(v)));
  const aspect = output.width / output.height;
  const setW = (w: number) => patchOutput(lock ? { width: w, height: clamp(w / aspect) } : { width: w });
  const setH = (h: number) => patchOutput(lock ? { height: h, width: clamp(h * aspect) } : { height: h });
  return (
    <div className="output-size">
      <span className="label">Output</span>
      <select
        value={match ? match.label : "custom"}
        title="Output resolution presets"
        onChange={(e) => {
          const s = sizes.find((x) => x.label === e.target.value);
          if (s) patchOutput({ width: s.w, height: s.h });
        }}
      >
        {sizes.map((s) => (
          <option key={s.label} value={s.label}>
            {s.label}
          </option>
        ))}
        <option value="custom">{match ? "Custom…" : `Custom · ${output.width} × ${output.height}`}</option>
      </select>
      <DimInput value={output.width} max={max} onCommit={setW} title="Width" />
      <button className="icon-btn dim-btn" title="Swap width and height" onClick={() => patchOutput({ width: output.height, height: output.width })}>
        ⇄
      </button>
      <DimInput value={output.height} max={max} onCommit={setH} title="Height" />
      <button className={`icon-btn dim-btn${lock ? " on" : ""}`} title={lock ? "Aspect ratio locked — click to unlock" : "Lock aspect ratio"} onClick={() => setLock(!lock)}>
        {lock ? <IconLock /> : <IconUnlock />}
      </button>
    </div>
  );
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const { setModal } = useApp.getState();
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-btn${open ? " open" : ""}`} onClick={() => setOpen(!open)}>
        File
      </button>
      {open ? (
        <div className="menu-list">
          <button onClick={run(() => useApp.getState().newBlank())}>
            New blank design <kbd>Ctrl+N</kbd>
          </button>
          <button onClick={run(openProject)}>
            Open project… <kbd>Ctrl+O</kbd>
          </button>
          <button onClick={run(() => saveProject(false))}>
            Save project <kbd>Ctrl+S</kbd>
          </button>
          <button onClick={run(() => saveProject(true))}>
            Save project as… <kbd>Ctrl+Shift+S</kbd>
          </button>
          <hr />
          <button onClick={run(() => void importAndPlace("image"))}>Import photo…</button>
          <button onClick={run(() => void importAndPlace("video"))}>Import video…</button>
          <button onClick={run(() => void importAndPlace("font"))}>Import font…</button>
          <hr />
          <button onClick={run(() => setModal("savePreset"))}>Save as my preset…</button>
          <button onClick={run(importPreset)}>Import preset file…</button>
          <button onClick={run(exportPresetFile)}>Export preset file…</button>
          <hr />
          <button onClick={run(() => setModal("export"))}>
            Export images / video… <kbd>Ctrl+E</kbd>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UndoRedo() {
  const { canUndo, canRedo } = useHistory();
  return (
    <div className="undo-redo">
      <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        <IconUndo />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
        <IconRedo />
      </button>
    </div>
  );
}

export function TopBar() {
  const { renderer } = useRenderServices();
  const name = useApp((s) => s.doc.name);
  const projectPath = useApp((s) => s.projectPath);
  const { randomize, setModal } = useApp.getState();
  // Documents are normalized to at most 8192 px per side.
  const max = Math.min(8192, renderer.info.maxTextureSize);
  const fileName = projectPath?.split(/[\\/]/).pop();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">CYBERFACADE</span>
      </div>
      <FileMenu />
      <UndoRedo />
      <div className="doc-name" title={projectPath ?? "Unsaved document"}>
        {name}
        {fileName ? <span className="doc-file">{fileName}</span> : null}
      </div>
      <div className="spacer" />
      <OutputSize max={max} />
      <button className="btn" onClick={() => void importAndPlace("any")} title="Import photos, videos or fonts (or drag them onto the window)">
        <IconImport /> <span className="btn-text">Import</span>
      </button>
      <button className="btn" onClick={() => setModal("savePreset")} title="Save this design as your own preset">
        <IconSave /> <span className="btn-text">Save preset</span>
      </button>
      <button className="btn" onClick={() => setModal("export")} title="Export (Ctrl+E)">
        Export
      </button>
      <button className="btn primary" onClick={() => randomize()} title="Randomize (R)">
        <IconSparkle /> Randomize
      </button>
      <div className="gpu-chip" title={`${renderer.info.backend} · ${renderer.info.adapter} · max texture ${renderer.info.maxTextureSize}`}>
        <span className="dot" /> <span className="btn-text">{renderer.info.backend}</span>
      </div>
    </header>
  );
}
