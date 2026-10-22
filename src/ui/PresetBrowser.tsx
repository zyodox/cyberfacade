import { useEffect, useMemo, useState } from "react";
import { builtInPresets } from "../presets/registry";
import { PRESET_CATEGORIES, type PresetDef } from "../presets/types";
import { useThumbnails } from "../preview/thumbnails";
import { useApp } from "../state/store";
import { IconSearch, IconStar, IconTrash } from "./icons";
import { useRenderServices } from "./RendererContext";

type Filter = "all" | "favorites" | "recent" | "user" | (typeof PRESET_CATEGORIES)[number];

export function PresetBrowser() {
  const { thumbnails } = useRenderServices();
  const userPresets = useApp((s) => s.userPresets);
  const favorites = useApp((s) => s.favorites);
  const recents = useApp((s) => s.recents);
  const activeId = useApp((s) => s.preset?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(userPresets.length ? "user" : "all");

  const all = useMemo(() => [...builtInPresets(), ...userPresets.map((p) => ({ ...p, user: true }))], [userPresets]);

  useEffect(() => thumbnails.request(all), [all, thumbnails]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: PresetDef[] = all;
    if (filter === "favorites") list = all.filter((p) => favorites.includes(p.id));
    else if (filter === "recent") list = recents.map((id) => all.find((p) => p.id === id)).filter((p): p is PresetDef => !!p);
    else if (filter === "user") list = all.filter((p) => p.user);
    else if (filter !== "all") list = all.filter((p) => p.category === filter);
    if (q) list = list.filter((p) => [p.name, p.category, p.description ?? "", ...(p.tags ?? [])].join(" ").toLowerCase().includes(q));
    return list;
  }, [all, filter, query, favorites, recents]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of all) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [all]);

  const grouped = filter === "all" && !query;

  return (
    <div className="tab-body">
      <div className="search">
        <IconSearch />
        <input placeholder="Search presets, tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
        <option value="user">My presets ({userPresets.length})</option>
        <option value="all">All presets ({all.length})</option>
        <option value="favorites">★ Favorites ({favorites.length})</option>
        <option value="recent">Recent</option>
        <optgroup label="Categories">
          {PRESET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c} ({counts[c] ?? 0})
            </option>
          ))}
        </optgroup>
      </select>
      <div className="panel-scroll preset-list">
        {visible.length === 0 ? (
          <div className="empty">{filter === "user" && !query ? "No presets of your own yet — build something and press “Save preset” in the top bar." : "No presets match."}</div>
        ) : null}
        {grouped
          ? PRESET_CATEGORIES.filter((c) => counts[c]).map((c) => (
              <div key={c}>
                <div className="preset-group">{c}</div>
                <div className="preset-grid">
                  {visible.filter((p) => p.category === c).map((p) => (
                    <PresetCard key={p.id} preset={p} active={p.id === activeId} favorite={favorites.includes(p.id)} />
                  ))}
                </div>
              </div>
            ))
          : (
            <div className="preset-grid">
              {visible.map((p) => (
                <PresetCard key={p.id} preset={p} active={p.id === activeId} favorite={favorites.includes(p.id)} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function PresetCard({ preset, active, favorite }: { preset: PresetDef; active: boolean; favorite: boolean }) {
  const thumb = useThumbnails((s) => s[preset.id]);
  const { loadPreset, toggleFavorite } = useApp.getState();
  return (
    <div className={`preset-card${active ? " active" : ""}`} onClick={() => loadPreset(preset)} title={preset.description}>
      <div className="preset-thumb">{thumb ? <img src={thumb} alt="" draggable={false} /> : <div className="thumb-pending" />}</div>
      <div className="preset-info">
        <div className="preset-name">{preset.name}</div>
        <div className="preset-desc">{preset.description}</div>
      </div>
      {preset.user ? (
        <button
          className="del-btn"
          title="Delete user preset"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete user preset “${preset.name}”?`)) useApp.getState().removeUserPreset(preset.id);
          }}
        >
          <IconTrash width={12} height={12} />
        </button>
      ) : null}
      <button
        className={`fav-btn${favorite ? " on" : ""}`}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(preset.id);
        }}
      >
        <IconStar filled={favorite} />
      </button>
    </div>
  );
}
