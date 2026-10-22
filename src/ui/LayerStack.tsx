import { lockPath } from "../presets/randomize";
import { getGenerator, listGenerators } from "../procedural/registry";
import { BLEND_MODES, type GeneratorKind, type LayerInstance } from "../procedural/types";
import { useApp } from "../state/store";
import { SelectField, Slider, SubGroup, ToggleField } from "./controls";
import { IconBookmark, IconCopy, IconDown, IconEye, IconEyeOff, IconPlus, IconTrash, IconUp } from "./icons";
import { ParamControl } from "./ParamControl";
import { ELEMENT_CATEGORIES, ELEMENTS } from "./elements";
import { addElement, addPhotoLights } from "./importActions";
import { toast } from "./toastStore";
import type { ParamValue } from "../procedural/params";

const blendOptions = BLEND_MODES.map((b) => ({ id: b, label: b[0].toUpperCase() + b.slice(1) }));

/** One-click night states for window layers (only parameters the layer has are touched). */
const WINDOW_STATES: Record<string, { label: string; hint: string; params: Record<string, ParamValue> }> = {
  off: { label: "Off", hint: "All rooms dark, faint glass reflection only", params: { lightMode: "none", occupancy: 0, spill: 0.02, unlit: 0.02, ambient: 0.01, toggleAmount: 0 } },
  on: { label: "All on", hint: "Every room lit, no switching", params: { lightMode: "all", toggleRate: 0, roomVariation: 0 } },
  steady: { label: "Steady", hint: "Keep the current rooms, stop switching and flicker", params: { toggleRate: 0, tvRatio: 0, flicker: 0 } },
  dim: { label: "Dim", hint: "Few lit rooms at low level", params: { lightMode: "occupancy", occupancy: 0.3, intensity: 0.55, spill: 0.08, brightnessVar: 0.5 } },
  warm: { label: "Warm", hint: "Warm tungsten light", params: { coolRatio: 0, warmColor: "#ffb877", tempVariation: 0.2, intensity: 1.4 } },
  cool: { label: "Cool", hint: "Cool office light", params: { coolRatio: 1, coolColor: "#d9e6ff", warmColor: "#e8eeff", tempVariation: 0.12, intensity: 1.5 } },
  bright: { label: "Bright", hint: "Most rooms lit, strong", params: { lightMode: "occupancy", occupancy: 0.82, intensity: 3.2, brightnessVar: 0.2 } },
  colored: { label: "Colored", hint: "Saturated tinted rooms (cyberpunk)", params: { warmColor: "#ff3a6e", coolColor: "#39d4ff", coolRatio: 0.5, tempVariation: 0.6, intensity: 2 } },
  animated: { label: "Animated", hint: "Rooms switching, TVs flickering", params: { toggleRate: 0.35, toggleAmount: 0.45, tvRatio: 0.2, flicker: 0.1 } },
};

const KIND_LABELS: Record<GeneratorKind, string> = {
  generator: "Generators",
  mask: "Masks",
  modifier: "Modifiers",
  animation: "Animation",
  color: "Color",
  emission: "Emission",
};

function AddLayerMenu() {
  const { addLayer } = useApp.getState();
  const byKind = new Map<GeneratorKind, ReturnType<typeof listGenerators>>();
  for (const g of listGenerators()) {
    if (!byKind.has(g.kind)) byKind.set(g.kind, []);
    byKind.get(g.kind)!.push(g);
  }
  return (
    <div className="add-layer-row">
      <label className="add-layer" title="Add an element after the selected layer (the Build tab on the left has the full library)">
        <IconPlus />
        <span>Add element</span>
        <select
          value=""
          onChange={(e) => {
            const r = ELEMENTS.find((x) => x.id === e.target.value);
            if (r) void addElement(r);
          }}
        >
          <option value="" disabled>
            Add element…
          </option>
          {ELEMENT_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {ELEMENTS.filter((x) => x.category === cat).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} — {x.hint}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="add-layer raw" title="Add a raw generator with default settings">
        <span>Raw…</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addLayer(e.target.value);
          }}
        >
          <option value="" disabled>
            Raw generator…
          </option>
          {[...byKind.entries()].map(([kind, gens]) => (
            <optgroup key={kind} label={KIND_LABELS[kind]}>
              {gens.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} — {g.description}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

export function LayerStack() {
  const layers = useApp((s) => s.doc.layers);
  const selectedId = useApp((s) => s.selectedLayerId);
  const { selectLayer, patchLayer, moveLayer } = useApp.getState();
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="layers">
      <AddLayerMenu />
      <div className="layer-list">
        {layers.map((l, idx) => {
          const def = getGenerator(l.generator);
          return (
            <div
              key={l.id}
              className={`layer-row${l.id === selectedId ? " selected" : ""}${l.enabled ? "" : " disabled"}`}
              onClick={() => selectLayer(l.id)}
            >
              <button
                className="icon-btn"
                title={l.enabled ? "Disable layer" : "Enable layer"}
                onClick={(e) => {
                  e.stopPropagation();
                  patchLayer(l.id, { enabled: !l.enabled });
                }}
              >
                {l.enabled ? <IconEye /> : <IconEyeOff />}
              </button>
              <span className="layer-index">{idx + 1}</span>
              <span className="layer-name">
                {l.name}
                <small>{def?.label ?? l.generator}</small>
              </span>
              <span className="layer-blend">{l.blend}</span>
              <span className="layer-move">
                <button className="icon-btn" disabled={idx === 0} title="Move up" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, -1))}>
                  <IconUp />
                </button>
                <button className="icon-btn" disabled={idx === layers.length - 1} title="Move down" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, 1))}>
                  <IconDown />
                </button>
              </span>
            </div>
          );
        })}
        {layers.length === 0 ? (
          <div className="layer-empty">
            Empty design. Add elements from the <b>Build</b> tab on the left — e.g. Concrete, a few windows, a neon sign — or drop a photo or video onto the window.
          </div>
        ) : null}
        <div className="layer-hint">Processed top → bottom · “Behind” layers fill what’s empty</div>
      </div>
      {selected ? <LayerEditor layer={selected} /> : null}
    </div>
  );
}

function LayerEditor({ layer }: { layer: LayerInstance }) {
  const locks = useApp((s) => s.locks);
  const { setParam, patchLayer, toggleLock, duplicateLayer, removeLayer, saveLayerToLibrary } = useApp.getState();
  const def = getGenerator(layer.generator);
  if (!def) return null;

  const groups = new Map<string, typeof def.params>();
  for (const p of def.params) {
    const g = p.group ?? "Parameters";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  return (
    <div className="layer-editor">
      <div className="layer-editor-head">
        <input className="layer-title" value={layer.name} onChange={(e) => patchLayer(layer.id, { name: e.target.value })} />
        <span className="layer-kind">{def.label}</span>
        <button
          className="icon-btn"
          title="Save to My layers (reuse it in any design from the Build tab)"
          onClick={() => {
            saveLayerToLibrary(layer.id);
            toast(`Saved “${layer.name}” to My layers`, "success");
          }}
        >
          <IconBookmark />
        </button>
        <button className="icon-btn" title="Duplicate layer" onClick={() => duplicateLayer(layer.id)}>
          <IconCopy />
        </button>
        <button className="icon-btn danger" title="Delete layer" onClick={() => removeLayer(layer.id)}>
          <IconTrash />
        </button>
      </div>
      <p className="layer-desc">{def.description}</p>
      {layer.generator === "windows" || layer.generator === "interiors" ? (
        <div className="state-chips" title="Night-time window states (sets several parameters at once)">
          <span>State</span>
          {Object.entries(WINDOW_STATES).map(([id, st]) => (
            <button
              key={id}
              className="chip"
              title={st.hint}
              onClick={() => {
                for (const [k, v] of Object.entries(st.params)) if (k in layer.params) setParam(layer.id, k, v);
              }}
            >
              {st.label}
            </button>
          ))}
        </div>
      ) : null}
      {layer.generator === "media" ? (
        <button className="btn photo-lights-btn" title="Adds a Photo Lights layer above this picture: its lit windows and lamps flicker, switch on / off and glow — each on its own" onClick={() => addPhotoLights()}>
          ✦ Animate the lights in this picture
        </button>
      ) : null}
      <SubGroup title="Compositing">
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} onChange={(v) => patchLayer(layer.id, { opacity: v })} />
        <SelectField label="Blend" value={layer.blend} options={blendOptions} onChange={(v) => patchLayer(layer.id, { blend: v })} />
        <ToggleField label="Clip to layers below" value={layer.clip} onChange={(v) => patchLayer(layer.id, { clip: v })} />
        <Slider label="Region bottom" value={layer.region.min} min={0} max={1} onChange={(v) => patchLayer(layer.id, { region: { ...layer.region, min: v } })} />
        <Slider label="Region top" value={layer.region.max} min={0} max={1} onChange={(v) => patchLayer(layer.id, { region: { ...layer.region, max: v } })} />
        <Slider label="Region softness" value={layer.region.soft} min={0} max={0.5} onChange={(v) => patchLayer(layer.id, { region: { ...layer.region, soft: v } })} />
        <Slider label="Region left" value={layer.regionX.min} min={0} max={1} onChange={(v) => patchLayer(layer.id, { regionX: { ...layer.regionX, min: v } })} />
        <Slider label="Region right" value={layer.regionX.max} min={0} max={1} onChange={(v) => patchLayer(layer.id, { regionX: { ...layer.regionX, max: v } })} />
        <Slider label="Region softness X" value={layer.regionX.soft} min={0} max={0.5} onChange={(v) => patchLayer(layer.id, { regionX: { ...layer.regionX, soft: v } })} />
        <ToggleField label="Invert region" value={layer.region.invert} onChange={(v) => patchLayer(layer.id, { region: { ...layer.region, invert: v } })} />
      </SubGroup>
      <SubGroup title="Time displacement" defaultOpen={layer.timeShift.x !== 0 || layer.timeShift.y !== 0}>
        <Slider label="Offset bottom → top" value={layer.timeShift.y} min={-2} max={2} unit="loops" hint="Slit-scan: upper floors run ahead / behind in time" onChange={(v) => patchLayer(layer.id, { timeShift: { ...layer.timeShift, y: v } })} />
        <Slider label="Offset left → right" value={layer.timeShift.x} min={-2} max={2} unit="loops" onChange={(v) => patchLayer(layer.id, { timeShift: { ...layer.timeShift, x: v } })} />
        <ToggleField label="Step per floor / bay" value={layer.timeShift.quantize} onChange={(v) => patchLayer(layer.id, { timeShift: { ...layer.timeShift, quantize: v } })} />
      </SubGroup>
      {[...groups.entries()].map(([g, params]) => (
        <SubGroup key={g} title={g}>
          {params.map((p) => {
            const path = lockPath.param(layer.id, p.key);
            return (
              <ParamControl
                key={p.key}
                def={p}
                value={layer.params[p.key]}
                locked={!!locks[path]}
                onToggleLock={() => toggleLock(path)}
                onChange={(v) => setParam(layer.id, p.key, v)}
              />
            );
          })}
        </SubGroup>
      ))}
    </div>
  );
}
