import { useEffect, useState, type CSSProperties } from "react";
import { ThumbnailService } from "./preview/thumbnails";
import { createRenderer } from "./renderer";
import { WebGPURenderer } from "./renderer/webgpu/WebGPURenderer";
import { installHistory, redo, undo } from "./state/history";
import { useApp } from "./state/store";
import { ParameterPanel } from "./ui/ParameterPanel";
import { LibraryPanel } from "./ui/LibraryPanel";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { installDropImport } from "./ui/importActions";
import { loadLibrary } from "./assets/assets";
import { PreviewPanel } from "./ui/PreviewPanel";
import { RendererContext, type RenderServices } from "./ui/RendererContext";
import { ExportDialog } from "./ui/ExportDialog";
import { openProject, saveProject } from "./ui/fileActions";
import { SavePresetDialog } from "./ui/SavePresetDialog";
import { loadPanelWidths, panelWidthVars, Splitter, type PanelWidths } from "./ui/Splitter";
import { Timeline } from "./ui/Timeline";
import { Toasts } from "./ui/Toasts";
import { TopBar } from "./ui/TopBar";

function Modals() {
  const modal = useApp((s) => s.modal);
  if (modal === "export") return <ExportDialog />;
  if (modal === "savePreset") return <SavePresetDialog />;
  return null;
}

type Boot ={ state: "loading" } | { state: "ready"; services: RenderServices } | { state: "error"; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [widths, setWidths] = useState<PanelWidths>(loadPanelWidths);

  useEffect(() => {
    let cancelled = false;
    let services: RenderServices | null = null;
    const t0 = performance.now();
    createRenderer()
      .then((renderer) => {
        if (import.meta.env.DEV) {
          console.info(`[boot] renderer ready in ${Math.round(performance.now() - t0)} ms (page ${Math.round(performance.now())} ms)`);
          (window as unknown as { __bootMs: number }).__bootMs = Math.round(performance.now());
        }
        if (cancelled) return renderer.dispose();
        if (renderer instanceof WebGPURenderer) {
          renderer.onDeviceLost = (reason) => setBoot({ state: "error", message: `The GPU device was lost: ${reason}. Restart the app.` });
        }
        services = { renderer, thumbnails: new ThumbnailService(renderer) };
        if (import.meta.env.DEV) void import("./preview/debugHooks").then((m) => m.installDebugHooks(renderer));
        setBoot({ state: "ready", services });
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setBoot({ state: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      services?.renderer.dispose();
    };
  }, []);

  useEffect(() => {
    void loadLibrary();
    return installDropImport();
  }, []);

  useEffect(() => {
    installHistory();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : document.body;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        // Inside text fields, let the browser's own text undo work.
        const inText = !!el.closest("input[type=text], input:not([type]), input[type=number], textarea");
        if ((k === "z" || k === "y") && !inText) {
          e.preventDefault();
          if (k === "y" || (k === "z" && e.shiftKey)) redo();
          else undo();
          return;
        }
        if (k === "s") {
          e.preventDefault();
          void saveProject(e.shiftKey);
        } else if (k === "o") {
          e.preventDefault();
          void openProject();
        } else if (k === "e") {
          e.preventDefault();
          useApp.getState().setModal("export");
        } else if (k === "n") {
          e.preventDefault();
          useApp.getState().newBlank();
        }
        return;
      }
      if (el.closest("input, select, textarea") || useApp.getState().modal) return;
      if (e.code === "Space") {
        e.preventDefault();
        useApp.getState().togglePlaying();
      } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
        useApp.getState().randomize();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (boot.state === "loading") {
    return (
      <div className="boot">
        <span className="brand-mark" />
        <p>Initializing GPU…</p>
      </div>
    );
  }
  if (boot.state === "error") {
    return (
      <div className="boot error">
        <span className="brand-mark" />
        <h2>GPU initialization failed</h2>
        <pre>{boot.message}</pre>
      </div>
    );
  }

  return (
    <RendererContext.Provider value={boot.services}>
      <div className={`app${widths.left === 0 ? " left-collapsed" : ""}${widths.right === 0 ? " right-collapsed" : ""}`} style={panelWidthVars(widths) as CSSProperties}>
        <ErrorBoundary name="Top bar">
          <TopBar />
        </ErrorBoundary>
        <ErrorBoundary name="Library">
          <LibraryPanel />
        </ErrorBoundary>
        <Splitter side="left" widths={widths} onChange={setWidths} />
        <ErrorBoundary name="Preview">
          <PreviewPanel />
        </ErrorBoundary>
        <Splitter side="right" widths={widths} onChange={setWidths} />
        <ErrorBoundary name="Parameters">
          <ParameterPanel />
        </ErrorBoundary>
        <ErrorBoundary name="Timeline">
          <Timeline />
        </ErrorBoundary>
      </div>
      <ErrorBoundary name="Dialog">
        <Modals />
      </ErrorBoundary>
      <Toasts />
    </RendererContext.Provider>
  );
}
