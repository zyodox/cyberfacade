import { useState } from "react";
import { assetUrl, useAssets, type AssetMeta } from "../assets/assets";
import type { AssetParam, FontParam, TextParam } from "../procedural/params";
import { importFiles, pickFiles } from "./importActions";
import { ACCEPT } from "../assets/assets";
import { ALL_PHRASES, PHRASE_GROUPS, PHRASE_SETS } from "./phrases";

export const SYSTEM_FONTS = [
  "Yu Gothic",
  "Yu Gothic UI",
  "Meiryo",
  "MS Gothic",
  "Yu Mincho",
  "Microsoft YaHei",
  "SimHei",
  "Malgun Gothic",
  "Bahnschrift",
  "Segoe UI",
  "Segoe UI Light",
  "Segoe UI Black",
  "Arial",
  "Arial Black",
  "Impact",
  "Franklin Gothic Medium",
  "Consolas",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

function formatSize(bytes: number): string {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

export function assetLabel(m: AssetMeta): string {
  const dims = m.width ? ` · ${m.width}×${m.height}` : "";
  const dur = m.duration ? ` · ${m.duration.toFixed(1)} s` : "";
  return `${m.name}${dims}${dur}`;
}

export function AssetThumb({ meta, size = 36 }: { meta: AssetMeta; size?: number }) {
  const url = assetUrl(meta.id);
  const style = { width: size, height: size };
  if (meta.kind === "font") {
    return (
      <span className="asset-thumb font" style={{ ...style, fontFamily: `"${meta.family}", sans-serif` }}>
        Aa
      </span>
    );
  }
  if (!url) return <span className="asset-thumb" style={style} />;
  if (meta.kind === "video") return <video className="asset-thumb" style={style} src={`${url}#t=0.5`} muted preload="metadata" />;
  return <img className="asset-thumb" style={style} src={url} alt="" draggable={false} />;
}

export function TextField({ def, value, onChange }: { def: TextParam; value: string; onChange(v: string): void }) {
  return (
    <div className="row text-row">
      <span className="lock-spacer" />
      <label className="field text-field">
        <span className="field-label">{def.label}</span>
        {def.multiline ? (
          <textarea className="text-input" rows={Math.min(4, Math.max(1, value.split("\n").length))} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        ) : (
          <input className="text-input" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        )}
      </label>
      <PhrasePicker multiline={!!def.multiline} value={value} onChange={onChange} />
    </div>
  );
}

/** Ready-made copy: replaces the text, or adds a line to multi-line fields. */
function PhrasePicker({ multiline, value, onChange }: { multiline: boolean; value: string; onChange(v: string): void }) {
  const [add, setAdd] = useState(false);
  const put = (t: string) => onChange(multiline && add && value.trim() ? `${value}\n${t}` : t);
  const random = () => {
    if (multiline && !add) {
      const pool = [...ALL_PHRASES].sort(() => Math.random() - 0.5).slice(0, 4);
      onChange(pool.map((p) => p.text).join("\n"));
    } else put(ALL_PHRASES[Math.floor(Math.random() * ALL_PHRASES.length)].text);
  };
  return (
    <div className="asset-pick phrase-pick">
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) put(e.target.value);
        }}
        title="Pick ready-made sign text (Japanese shows its English meaning)"
      >
        <option value="">Phrases…</option>
        {multiline ? (
          <optgroup label="Sets (several lines)">
            {PHRASE_SETS.map((p) => (
              <option key={p.label} value={p.text}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {PHRASE_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.phrases.map((p) => (
              <option key={p.text} value={p.text}>
                {p.en ? `${p.text} — ${p.en}` : p.text}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {multiline ? (
        <label className="phrase-add" title="Add the picked phrase as a new line instead of replacing">
          <input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} /> add line
        </label>
      ) : null}
      <button className="btn small" onClick={(e) => (e.preventDefault(), random())} title="Random phrase">
        🎲
      </button>
    </div>
  );
}

export function AssetField({ def, value, onChange }: { def: AssetParam; value: string; onChange(v: string): void }) {
  const assets = useAssets((s) => s.assets);
  useAssets((s) => s.version);
  const list = Object.values(assets)
    .filter((a) => (def.accept as string[]).includes(a.kind))
    .sort((a, b) => b.addedAt - a.addedAt);
  const current = value ? assets[value] : undefined;
  const pick = async () => {
    const accept = def.accept.map((k) => ACCEPT[k]).join(",");
    const [meta] = await importFiles(await pickFiles(accept, false));
    if (meta) onChange(meta.id);
  };
  return (
    <div className="row asset-row">
      <span className="lock-spacer" />
      <div className="field asset-field">
        <span className="field-label">{def.label}</span>
        <div className="asset-pick">
          {current ? <AssetThumb meta={current} size={30} /> : <span className="asset-thumb empty" style={{ width: 30, height: 30 }} />}
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{value && !current ? "Missing file" : "— none —"}</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.kind === "video" ? "▶ " : ""}
                {assetLabel(a)}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={pick} title="Import a photo or video">
            Import…
          </button>
        </div>
        {current ? <span className="asset-meta">{`${current.kind} · ${formatSize(current.size)}`}</span> : null}
      </div>
    </div>
  );
}

export function FontField({ def, value, onChange }: { def: FontParam; value: string; onChange(v: string): void }) {
  const assets = useAssets((s) => s.assets);
  const fonts = Object.values(assets).filter((a) => a.kind === "font");
  const known = value.startsWith("asset:") || SYSTEM_FONTS.includes(value);
  const [custom, setCustom] = useState(!known);
  const pick = async () => {
    const [meta] = await importFiles(await pickFiles(ACCEPT.font, false));
    if (meta) onChange(`asset:${meta.id}`);
  };
  const family = value.startsWith("asset:") ? (assets[value.slice(6)]?.family ?? "sans-serif") : value;
  return (
    <div className="row asset-row">
      <span className="lock-spacer" />
      <div className="field asset-field">
        <span className="field-label">{def.label}</span>
        <div className="asset-pick">
          <span className="asset-thumb font" style={{ width: 30, height: 30, fontFamily: `"${family}", sans-serif` }}>
            Aa
          </span>
          <select
            value={custom ? "__custom" : value}
            onChange={(e) => {
              if (e.target.value === "__custom") setCustom(true);
              else {
                setCustom(false);
                onChange(e.target.value);
              }
            }}
          >
            {fonts.length ? (
              <optgroup label="Imported">
                {fonts.map((f) => (
                  <option key={f.id} value={`asset:${f.id}`}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="System">
              {SYSTEM_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
            <option value="__custom">Other installed font…</option>
          </select>
          <button className="btn small" onClick={pick} title="Import a TTF / OTF / WOFF font">
            Import…
          </button>
        </div>
        {custom ? <input className="text-input" placeholder="Installed font family name" value={value.startsWith("asset:") ? "" : value} onChange={(e) => onChange(e.target.value)} spellCheck={false} /> : null}
      </div>
    </div>
  );
}
