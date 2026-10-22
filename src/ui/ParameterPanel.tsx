import { lockPath } from "../presets/randomize";
import { SYMMETRY_MODES, TONEMAPS, type Tonemap } from "../procedural/types";
import { useApp } from "../state/store";
import { LockButton, Section, SelectField, Slider } from "./controls";
import { IconDice, IconReset, IconSparkle } from "./icons";
import { AudioSection } from "./AudioSection";
import { LayerStack } from "./LayerStack";

const tonemapLabels: Record<Tonemap, string> = { agx: "AgX", "agx-punchy": "AgX Punchy", aces: "ACES", clamp: "Linear (clamp)" };
const symmetryLabels: Record<string, string> = { none: "None", mirror: "Mirror in facade", repeat: "Identical facades", "mirror-repeat": "Mirror + identical" };

export function ParameterPanel() {
  const doc = useApp((s) => s.doc);
  const preset = useApp((s) => s.preset);
  const locks = useApp((s) => s.locks);
  const a = useApp.getState();
  const arch = doc.architecture;
  const archLock = (k: string) => ({ locked: !!locks[lockPath.arch(k)], onToggleLock: () => a.toggleLock(lockPath.arch(k)) });

  return (
    <aside className="panel params-panel">
      <div className="panel-scroll">
        <Section title="Design">
          <div className="preset-meta">
            <input className="preset-meta-name name-input" value={doc.name} onChange={(e) => useApp.setState((s) => ({ doc: { ...s.doc, name: e.target.value } }))} title="Design name" />
            <div className="preset-meta-cat">{preset ? `from ${preset.user ? "my preset" : "preset"} “${preset.name}”` : "built from scratch"}</div>
          </div>
          <div className="row">
            <LockButton locked={!!locks.seed} onToggle={() => a.toggleLock(lockPath.seed)} />
            <label className="field">
              <span className="field-label">Seed</span>
              <span className="seed-wrap">
                <input
                  className="num-input"
                  type="number"
                  value={doc.seed}
                  min={0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v)) a.setSeed(v);
                  }}
                />
                <button className="icon-btn" title="New seed" onClick={() => a.newSeed()}>
                  <IconDice />
                </button>
              </span>
            </label>
          </div>
          <div className="btn-row">
            <button className="btn primary grow" onClick={() => a.randomize()} title="New seed + parameter variation within the preset's identity (locked values are kept)">
              <IconSparkle /> Randomize
            </button>
            <button className="btn" onClick={() => a.resetToPreset()} title="Restore the preset's original values">
              <IconReset /> Reset
            </button>
          </div>
        </Section>

        <Section title="Look">
          <Slider label="Emission" value={doc.look.emission} min={0} max={8} onChange={(v) => a.patchLook({ emission: v })} />
          <Slider label="Exposure" value={doc.look.exposure} min={-6} max={6} unit="EV" onChange={(v) => a.patchLook({ exposure: v })} />
          <SelectField label="Tonemap" value={doc.look.tonemap} options={TONEMAPS.map((t) => ({ id: t, label: tonemapLabels[t] }))} onChange={(v) => a.patchLook({ tonemap: v })} />
        </Section>

        <Section title="Architecture">
          <Slider label="Floors" value={arch.floors} min={1} max={160} integer onChange={(v) => a.patchArchitecture({ floors: v })} {...archLock("floors")} />
          <Slider label="Bays per facade" value={arch.bays} min={1} max={64} integer onChange={(v) => a.patchArchitecture({ bays: v })} {...archLock("bays")} />
          <Slider label="Facades in texture" value={arch.facades} min={1} max={8} integer hint="How many facades the texture spans side by side (wrap textures)" onChange={(v) => a.patchArchitecture({ facades: v })} />
          <Slider label="Slab / spandrel" value={arch.slab} min={0} max={0.6} onChange={(v) => a.patchArchitecture({ slab: v })} />
          <Slider label="Mullion" value={arch.mullion} min={0} max={0.6} onChange={(v) => a.patchArchitecture({ mullion: v })} />
          <SelectField label="Symmetry" value={arch.symmetry} options={SYMMETRY_MODES.map((m) => ({ id: m, label: symmetryLabels[m] }))} onChange={(v) => a.patchArchitecture({ symmetry: v })} />
        </Section>

        <Section title="Layers">
          <LayerStack />
        </Section>

        <AudioSection />
      </div>
    </aside>
  );
}
