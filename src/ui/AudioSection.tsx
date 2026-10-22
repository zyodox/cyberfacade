import { useEffect, useMemo, useRef } from "react";
import { audioEngine, useAudio } from "../audio/engine";
import { routeTargets } from "../audio/modulation";
import { AUDIO_BANDS, type AudioBand } from "../procedural/types";
import { useApp } from "../state/store";
import { Section, Slider } from "./controls";
import { IconPlus, IconReset, IconTrash } from "./icons";

const BAND_LABEL: Record<AudioBand, string> = { bass: "Bass", mid: "Mid", high: "High", level: "Level" };

/** Four live band meters drawn straight to a canvas (no React re-renders). */
function Meters() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      const b = audioEngine.bands();
      const w = c.width;
      const h = c.height;
      g.clearRect(0, 0, w, h);
      AUDIO_BANDS.forEach((k, i) => {
        const x = (i * w) / 4 + 3;
        const bw = w / 4 - 6;
        g.fillStyle = "#1e2226";
        g.fillRect(x, 0, bw, h);
        g.fillStyle = i === 3 ? "#d5d9dc" : "#76b900";
        const v = Math.min(1, b[k]);
        g.fillRect(x, h - v * h, bw, v * h);
      });
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="meters">
      <canvas ref={ref} width={240} height={36} />
      <div className="meter-labels">
        {AUDIO_BANDS.map((b) => (
          <span key={b}>{BAND_LABEL[b]}</span>
        ))}
      </div>
    </div>
  );
}

export function AudioSection() {
  const audio = useAudio();
  const doc = useApp((s) => s.doc);
  const { addAudioRoute, patchAudioRoute, removeAudioRoute } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const targets = useMemo(() => routeTargets(doc), [doc]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof targets>();
    for (const t of targets) {
      if (!m.has(t.group)) m.set(t.group, []);
      m.get(t.group)!.push(t);
    }
    return [...m.entries()];
  }, [targets]);

  return (
    <Section title="Audio reactivity" defaultOpen={false} right={audio.source !== "none" ? <span className="audio-dot" /> : undefined}>
      <div className="audio-source">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void audioEngine.loadFile(f).then(() => audioEngine.setPlaying(useApp.getState().playing));
            e.target.value = "";
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={audio.analyzing}>
          {audio.analyzing ? "Analyzing…" : "Audio file…"}
        </button>
        <button className="btn" onClick={() => void audioEngine.useMicrophone()}>
          Microphone
        </button>
        {audio.source !== "none" ? (
          <>
            {audio.source === "file" ? (
              <button className="icon-btn" title="Restart track" onClick={() => audioEngine.restart()}>
                <IconReset />
              </button>
            ) : null}
            <button className="icon-btn danger" title="Remove audio" onClick={() => audioEngine.clear()}>
              <IconTrash />
            </button>
          </>
        ) : null}
      </div>
      {audio.source !== "none" ? (
        <div className="audio-name">
          {audio.name}
          {audio.duration ? ` · ${audio.duration.toFixed(1)} s` : ""}
        </div>
      ) : (
        <p className="form-note">Load a track or use the microphone, then route bands to any numeric parameter. Files play with the timeline.</p>
      )}
      {audio.error ? <p className="form-note warn">{audio.error}</p> : null}
      {audio.source !== "none" ? <Meters /> : null}

      {doc.audio.routes.map((r) => (
        <div className="route" key={r.id}>
          <div className="route-head">
            <select value={r.band} onChange={(e) => patchAudioRoute(r.id, { band: e.target.value as AudioBand })}>
              {AUDIO_BANDS.map((b) => (
                <option key={b} value={b}>
                  {BAND_LABEL[b]}
                </option>
              ))}
            </select>
            <span className="route-arrow">→</span>
            <select value={r.target} onChange={(e) => patchAudioRoute(r.id, { target: e.target.value })}>
              {groups.map(([g, ts]) => (
                <optgroup key={g} label={g}>
                  {ts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button className="icon-btn danger" onClick={() => removeAudioRoute(r.id)} title="Remove route">
              <IconTrash />
            </button>
          </div>
          <Slider label="Amount" value={r.amount} min={-1} max={1} onChange={(v) => patchAudioRoute(r.id, { amount: v })} />
        </div>
      ))}
      <button className="btn add-route" onClick={() => addAudioRoute({ band: "bass", target: "look.emission", amount: 0.5 })}>
        <IconPlus /> Add route
      </button>
    </Section>
  );
}
