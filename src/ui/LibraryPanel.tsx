import { useState } from "react";
import { removeAsset, useAssets } from "../assets/assets";
import { localStore } from "../persistence/local";
import { useApp } from "../state/store";
import { AssetThumb, assetLabel } from "./assetControls";
import { ELEMENT_CATEGORIES, ELEMENTS, type ElementCategory } from "./elements";
import { IconPlus, IconTrash } from "./icons";
import { addElement, importAndPlace, placeAsset } from "./importActions";
import { PresetBrowser } from "./PresetBrowser";

type Tab = "build" | "assets" | "presets";

const CATEGORY_NOTES: Record<ElementCategory, string> = {
  Structure: "What the building is made of",
  Light: "Small lights, lines and beacons",
  Media: "Your photos and videos — billboards, ad playlists, tri-vision boards, hologram figures",
  Signage: "Neon, logos that draw on, HUD frames, live counters and clocks, tickers — any font or script",
  Motion: "Living light and particles — heartbeat, music pulse, octopus skin, sparks, words",
  Pattern: "Procedural films and motifs",
  Modify: "Treatments of the layers below — LED hardware, glitch looks, glow, grade",
};

export function LibraryPanel() {
  const [tab, setTabState] = useState<Tab>(() => {
    const t = localStore.loadLeftTab();
    return t === "assets" || t === "presets" ? t : "build";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    localStore.saveLeftTab(t);
  };
  const assetCount = useAssets((s) => Object.keys(s.assets).length);
  return (
    <aside className="panel browser-panel">
      <div className="lib-tabs">
        <button className={tab === "build" ? "active" : ""} onClick={() => setTab("build")}>
          Build
        </button>
        <button className={tab === "assets" ? "active" : ""} onClick={() => setTab("assets")}>
          Assets{assetCount ? <span className="count">{assetCount}</span> : null}
        </button>
        <button className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>
          Presets
        </button>
      </div>
      {tab === "build" ? <BuildTab /> : tab === "assets" ? <AssetsTab /> : <PresetBrowser />}
    </aside>
  );
}

function BuildTab() {
  const myLayers = useApp((s) => s.myLayers);
  const { newBlank, insertLayer, removeMyLayer } = useApp.getState();
  return (
    <div className="tab-body panel-scroll build-tab">
      <div className="build-actions">
        <button
          className="btn grow"
          title="Empty layer stack"
          onClick={() => {
            const s = useApp.getState();
            if (s.doc.layers.length === 0 || confirm("Start a new blank design? (Undo brings the current one back.)")) newBlank();
          }}
        >
          New blank
        </button>
        <button className="btn grow" title="Import photos, videos or fonts (or drop them anywhere)" onClick={() => void importAndPlace("any")}>
          Import…
        </button>
      </div>
      <p className="build-hint">Click an element to add it after the selected layer. Drag photos, videos or fonts anywhere onto the window.</p>

      {myLayers.length ? (
        <div className="el-group">
          <div className="el-group-head">
            My layers <span>saved from the layer editor</span>
          </div>
          {myLayers.map((m) => (
            <div key={m.id} className="my-layer" onClick={() => insertLayer(m.layer)} title="Add this saved layer">
              <IconPlus width={11} height={11} />
              <span className="grow">{m.name}</span>
              <small>{m.layer.generator}</small>
              <button
                className="icon-btn danger"
                title="Remove from My layers"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMyLayer(m.id);
                }}
              >
                <IconTrash width={11} height={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {ELEMENT_CATEGORIES.map((cat) => (
        <div key={cat} className="el-group">
          <div className="el-group-head">
            {cat} <span>{CATEGORY_NOTES[cat]}</span>
          </div>
          <div className="el-grid">
            {ELEMENTS.filter((e) => e.category === cat).map((e) => (
              <button key={e.id} className={`el-tile el-${cat.toLowerCase()}`} title={e.hint} onClick={() => void addElement(e)}>
                <span className="el-swatch" />
                <span className="el-label">{e.label}</span>
                <span className="el-hint">{e.needs ? `${e.hint} · asks for a file` : e.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetsTab() {
  const assets = useAssets((s) => s.assets);
  const list = Object.values(assets).sort((a, b) => b.addedAt - a.addedAt);
  return (
    <div className="tab-body panel-scroll assets-tab">
      <div className="build-actions">
        <button className="btn grow" onClick={() => void importAndPlace("image")}>
          Photo…
        </button>
        <button className="btn grow" onClick={() => void importAndPlace("video")}>
          Video…
        </button>
        <button className="btn grow" onClick={() => void importAndPlace("font")}>
          Font…
        </button>
      </div>
      <p className="build-hint">Imported files are kept in the app’s library and saved with projects. Click one to use it: photos and videos become a new layer, fonts go on the selected sign.</p>
      {list.length === 0 ? <div className="empty">No assets yet. Import or drop files here.</div> : null}
      <div className="asset-list">
        {list.map((m) => (
          <div key={m.id} className="asset-card" onClick={() => placeAsset(m)} title="Use in the design">
            <AssetThumb meta={m} size={44} />
            <div className="asset-info">
              <div className="asset-name">{m.name}</div>
              <div className="asset-sub">{assetLabel(m).slice(m.name.length + 3) || m.kind}</div>
            </div>
            <button
              className="icon-btn danger"
              title="Delete from library"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove “${m.name}” from the asset library? Layers using it will go blank.`)) void removeAsset(m.id);
              }}
            >
              <IconTrash width={12} height={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
