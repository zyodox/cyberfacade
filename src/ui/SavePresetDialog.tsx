import { useState } from "react";
import { documentToPreset } from "../presets/normalize";
import { PRESET_CATEGORIES, type PresetCategory } from "../presets/types";
import { useApp } from "../state/store";
import { Modal } from "./Modal";
import { useRenderServices } from "./RendererContext";
import { toast } from "./toastStore";

export function SavePresetDialog() {
  const { thumbnails } = useRenderServices();
  const s = useApp.getState();
  const [name, setName] = useState(s.doc.name);
  const [category, setCategory] = useState<PresetCategory>(s.preset?.category ?? "Realistic Buildings");
  const [description, setDescription] = useState(s.preset?.description ?? "");
  const overwrite = s.preset?.user ? s.preset : null;
  const close = () => useApp.getState().setModal(null);

  const save = (asNew: boolean) => {
    const id = !asNew && overwrite ? overwrite.id : `user-${Date.now().toString(36)}`;
    const preset = { ...documentToPreset({ ...s.doc, name }, { id, name, category, description }), user: true };
    const st = useApp.getState();
    st.addUserPreset(preset);
    st.loadPreset(preset);
    thumbnails.invalidate(id);
    toast(`Saved user preset “${name}”`, "success");
    close();
  };

  return (
    <Modal
      title="Save as user preset"
      onClose={close}
      width={460}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          {overwrite ? (
            <button className="btn" onClick={() => save(false)} disabled={!name.trim()}>
              Overwrite “{overwrite.name}”
            </button>
          ) : null}
          <button className="btn primary" onClick={() => save(true)} disabled={!name.trim()}>
            Save preset
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Name</span>
        <input className="text-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="form-row">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as PresetCategory)}>
          {PRESET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="form-row">
        <span>Description</span>
        <textarea className="text-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <p className="form-note">User presets store the full layer stack, seed, architecture, animation and look. They appear under “User presets” in the browser.</p>
    </Modal>
  );
}
