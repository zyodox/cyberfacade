import { useRef, useSyncExternalStore } from "react";
import { clock } from "../animation/clock";
import { useApp } from "../state/store";
import { Slider } from "./controls";
import { IconLoop, IconPause, IconPlay } from "./icons";

const EXPORT_FPS = 30;

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
};

export function Timeline() {
  const time = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const playing = useApp((s) => s.playing);
  const loop = useApp((s) => s.loop);
  const duration = useApp((s) => s.doc.animation.duration);
  const speed = useApp((s) => s.doc.animation.speed);
  const { togglePlaying, setLoop, setPlaying, patchAnimation } = useApp.getState();
  const bar = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ wasPlaying: boolean } | null>(null);

  const t = Math.min(time, duration);
  const frames = Math.round(duration * EXPORT_FPS);
  const frame = Math.min(frames - 1, Math.floor((t / duration) * frames));

  const seek = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    clock.set(f * duration * 0.99999);
  };

  const ticks = [];
  for (let s = 0; s <= Math.floor(duration); s++) ticks.push(s);

  return (
    <footer className="timeline">
      <div className="transport">
        <button className="play-btn" onClick={togglePlaying} title="Play / pause (Space)">
          {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
        </button>
        <button className={`tool-btn${loop ? " active" : ""}`} onClick={() => setLoop(!loop)} title="Loop playback">
          <IconLoop />
        </button>
        <div className="timecode">
          <span className="tc-main">{fmt(t)}</span>
          <span className="tc-sub">/ {fmt(duration)}</span>
        </div>
        <div className="frame-readout">
          f {frame + 1}/{frames} @ {EXPORT_FPS}
        </div>
      </div>
      <div
        ref={bar}
        className="scrub"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          scrub.current = { wasPlaying: playing };
          setPlaying(false);
          seek(e.clientX);
        }}
        onPointerMove={(e) => scrub.current && seek(e.clientX)}
        onPointerUp={() => {
          if (scrub.current?.wasPlaying) setPlaying(true);
          scrub.current = null;
        }}
      >
        <div className="scrub-track">
          {ticks.map((s) => (
            <div key={s} className="tick" style={{ left: `${(s / duration) * 100}%` }}>
              <span>{s}s</span>
            </div>
          ))}
          <div className="scrub-progress" style={{ width: `${(t / duration) * 100}%` }} />
          <div className="playhead" style={{ left: `${(t / duration) * 100}%` }} />
        </div>
        <div className="loop-note">seamless loop · phase {(t / duration).toFixed(3)}</div>
      </div>
      <div className="timeline-controls">
        <Slider label="Duration" value={duration} min={2} max={15} step={0.5} unit="s" onChange={(v) => patchAnimation({ duration: v })} />
        <Slider label="Speed" value={speed} min={0.1} max={4} unit="×" onChange={(v) => patchAnimation({ speed: v })} />
      </div>
    </footer>
  );
}
