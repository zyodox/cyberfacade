import type { ParamDef, ParamValue } from "../procedural/params";
import { AssetField, FontField, TextField } from "./assetControls";
import { ColorField, SelectField, Slider, ToggleField } from "./controls";

interface Props {
  def: ParamDef;
  value: ParamValue;
  locked?: boolean;
  onToggleLock?: () => void;
  onChange(v: ParamValue): void;
}

/** Schema-driven control: any generator parameter renders without bespoke UI. */
export function ParamControl({ def, value, locked, onToggleLock, onChange }: Props) {
  const lockProps = def.random === false ? {} : { locked, onToggleLock };
  switch (def.type) {
    case "float":
      return <Slider label={def.label} value={value as number} min={def.min} max={def.max} step={def.step} unit={def.unit} hint={def.hint} onChange={onChange} {...lockProps} />;
    case "int":
      return <Slider label={def.label} value={value as number} min={def.min} max={def.max} integer hint={def.hint} onChange={onChange} {...lockProps} />;
    case "color":
      return <ColorField label={def.label} value={value as string} onChange={onChange} {...lockProps} />;
    case "enum":
      return <SelectField label={def.label} value={value as string} options={def.options} onChange={onChange} />;
    case "bool":
      return <ToggleField label={def.label} value={value as boolean} onChange={onChange} />;
    case "text":
      return <TextField def={def} value={String(value ?? "")} onChange={onChange} />;
    case "asset":
      return <AssetField def={def} value={String(value ?? "")} onChange={onChange} />;
    case "font":
      return <FontField def={def} value={String(value ?? "")} onChange={onChange} />;
  }
}
