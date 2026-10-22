import { useRef, useState } from "react";
import { clock } from "../animation/clock";
import { audioEngine, useAudio } from "../audio/engine";
import { exportFrameCount, runExport, type ExportProgress, type ExportSettings } from "../export/exporter";
import { videoSupported } from "../export/video";
import { isDesktop, pickFolder, safeFileName } from "../platform/native";
import { useApp } from "../state/store";
import { ToggleField } from "./controls";
import { Modal } from "./Modal";
import { useRenderServices } from "./RendererContext";
import { toast, toastError } from "./toastStore";
const SETTINGS_KEY = "facade-studio.export-settings";

function loadSaved(): Partial<ExportSettings> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

export function ExportDialog() {
  const { renderer } = useRenderServices();
  const doc = useApp((s) => s.doc);
  const close = () => useApp.getState().setModal(null);
  const [s, setS] = useState<ExportSettings>(() => ({
    folder: "",
    baseName: safeFileName(doc.name),
    width: doc.output.width,
    height: doc.output.height,
    fps: 30,
    still: false,
    stillSeconds: clock.time,
    color: true,
    emission: true,
    mask: false,
    alpha: false,
    emissionFormat: "exr",
    maskFormat: "png",
    video: "none",
    videoMbps: 40,
    ...loadSaved(),
  }));
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  const patch = (p: Partial<ExportSettings>) => setS((x) => ({ ...x, ...p }));

  const frames = exportFrameCount(doc, s);
  const channelCount = [s.color, s.emission, s.mask, s.alpha].filter(Boolean).length;
  const busy = progress !== null;

  const start = async () => {
    try {
      let folder = s.folder;
      if (!folder) {
        const picked = await pickFolder("Choose export folder");
        if (!picked) return;
        folder = picked;
        patch({ folder });
      }
      const settings = { ...s, folder, stillSeconds: clock.time };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, stillSeconds: undefined }));
      } catch {
        /* non-fatal */
      }
      abort.current = new AbortController();
      setProgress({ frame: 0, frames, elapsedMs: 0, etaMs: 0, stage: "Starting" });
      useApp.getState().setPlaying(false);
      const audioAt = useAudio.getState().source === "file" ? (t: number) => audioEngine.bandsAt(t) : undefined;
      const summary = await runExport(renderer, doc, settings, setProgress, abort.current.signal, audioAt);
      toast(`Exported “${summary.name}”: ${summary.frames} frame${summary.frames > 1 ? "s" : ""} (${summary.files} files) in ${fmtTime(summary.elapsedMs)} → ${summary.folder}`, "success", 9000);
      close();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") toast("Export cancelled", "info");
      else toastError(e);
      setProgress(null);
    }
  };

  const pct = progress ? (progress.frame / Math.max(progress.frames, 1)) * 100 : 0;

  return (
    <Modal
      title="Export"
      onClose={() => (busy ? abort.current?.abort() : close())}
      width={560}
      footer={
        busy ? (
          <button className="btn" onClick={() => abort.current?.abort()}>
            Cancel export
          </button>
        ) : (
          <>
            <button className="btn" onClick={close}>
              Close
            </button>
            <button className="btn primary" onClick={start} disabled={!isDesktop() || (channelCount === 0 && s.video === "none")}>
              Export {s.still ? "still" : `${frames} frames`}
            </button>
          </>
        )
      }
    >
      {!isDesktop() ? <p className="form-note warn">Export writes files and is available in the desktop app.</p> : null}
      <fieldset disabled={busy} className="export-grid">
        <label className="form-row">
          <span>Folder</span>
          <span className="folder-row">
            <input className="text-input" value={s.folder} placeholder="Choose when exporting…" onChange={(e) => patch({ folder: e.target.value })} />
            <button
              className="btn"
              onClick={async () => {
                const f = await pickFolder("Choose export folder").catch(toastError);
                if (f) patch({ folder: f });
              }}
            >
              Browse
            </button>
          </span>
        </label>
        <label className="form-row">
          <span>File name</span>
          <input className="text-input" value={s.baseName} title="Existing exports are never overwritten: the next free number is added (_2, _3…)" onChange={(e) => patch({ baseName: e.target.value })} />
        </label>
        <div className="form-row">
          <span>Resolution</span>
          <span className="dims">
            <input className="num-input dim" type="number" value={s.width} min={16} max={renderer.info.maxTextureSize} onChange={(e) => patch({ width: Math.max(16, +e.target.value || 16) })} />
            ×
            <input className="num-input dim" type="number" value={s.height} min={16} max={renderer.info.maxTextureSize} onChange={(e) => patch({ height: Math.max(16, +e.target.value || 16) })} />
            {[512, 1024, 2048, 4096].map((n) => (
              <button key={n} className="chip" onClick={() => patch({ width: Math.round((n * doc.output.width) / Math.max(doc.output.width, doc.output.height)), height: Math.round((n * doc.output.height) / Math.max(doc.output.width, doc.output.height)) })}>
                {n >= 1024 ? `${n / 1024}K` : n}
              </button>
            ))}
          </span>
        </div>
        <div className="form-row">
          <span>Range</span>
          <span className="dims">
            <select value={s.still ? "still" : "loop"} onChange={(e) => patch({ still: e.target.value === "still" })}>
              <option value="loop">Full loop ({doc.animation.duration}s)</option>
              <option value="still">Still at playhead</option>
            </select>
            {!s.still ? (
              <select value={s.fps} onChange={(e) => patch({ fps: +e.target.value })}>
                {[24, 25, 30, 50, 60].map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
            ) : null}
          </span>
        </div>

        <div className="channel-grid">
          <div className="channel-card">
            <ToggleField label="Color" value={s.color} onChange={(v) => patch({ color: v })} />
            <small>Tonemapped sRGB · PNG</small>
          </div>
          <div className="channel-card">
            <ToggleField label="Emission" value={s.emission} onChange={(v) => patch({ emission: v })} />
            <select value={s.emissionFormat} onChange={(e) => patch({ emissionFormat: e.target.value as "exr" | "png" })}>
              <option value="exr">EXR · half float HDR (RGBA)</option>
              <option value="png">PNG · linear, clipped</option>
            </select>
          </div>
          <div className="channel-card">
            <ToggleField label="Mask" value={s.mask} onChange={(v) => patch({ mask: v })} />
            <select value={s.maskFormat} onChange={(e) => patch({ maskFormat: e.target.value as "png" | "exr" })}>
              <option value="png">PNG · 8-bit grey</option>
              <option value="exr">EXR · half float</option>
            </select>
          </div>
          <div className="channel-card">
            <ToggleField label="Alpha" value={s.alpha} onChange={(v) => patch({ alpha: v })} />
            <small>Emission-derived · PNG</small>
          </div>
        </div>

        {!s.still ? (
          <div className="form-row">
            <span>Video</span>
            <span className="dims">
              <select value={s.video} onChange={(e) => patch({ video: e.target.value as ExportSettings["video"] })} disabled={!videoSupported()}>
                <option value="none">None</option>
                <option value="mp4">MP4 · H.264 (hardware)</option>
                <option value="webm">WebM · VP9</option>
              </select>
              {s.video !== "none" ? (
                <label className="inline-select">
                  <input className="num-input dim" type="number" min={2} max={200} value={s.videoMbps} onChange={(e) => patch({ videoMbps: Math.max(2, +e.target.value || 40) })} /> Mbps
                </label>
              ) : null}
            </span>
          </div>
        ) : null}
      </fieldset>

      <p className="form-note">
        {s.still ? "One frame" : `${frames} frames`} × {channelCount} channel{channelCount === 1 ? "" : "s"}
        {s.video !== "none" && !s.still ? ` + ${s.video.toUpperCase()}` : ""}. Loops are exported seamlessly: frame {frames + 1} would equal frame 1.
        {s.emission && s.emissionFormat === "exr" ? " EXR emission keeps unclamped HDR values for Blender / Nuke (A = coverage)." : ""}
        {doc.audio.routes.length && useAudio.getState().source === "file" ? " Audio routes follow the loaded track from 0 s (frame time), so audio-reactive exports do not loop." : ""}
      </p>

      {progress ? (
        <div className="progress">
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-text">
            <span>
              {progress.stage} · frame {progress.frame}/{progress.frames}
            </span>
            <span>
              {fmtTime(progress.elapsedMs)} elapsed{progress.etaMs > 0 ? ` · ~${fmtTime(progress.etaMs)} left` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
