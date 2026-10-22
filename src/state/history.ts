/**
 * Undo / redo for everything that defines the texture: the document, the
 * preset it derives from (RANDOMIZE / Reset baseline) and parameter locks.
 *
 * Recording is automatic — a store subscription snapshots the previous state
 * whenever the document or preset changes, so every current and future edit
 * action is covered without per-action bookkeeping. Snapshots are cheap:
 * documents are immutable and share structure between edits.
 *
 * Coalescing: a continuous gesture (slider drag, typing) becomes one step. A
 * new step starts after a pointer release or a pause of COALESCE_MS.
 */
import { create } from "zustand";
import type { PresetDef } from "../presets/types";
import type { LockSet } from "../presets/randomize";
import type { FacadeDocument } from "../procedural/types";
import { useApp, type AppState } from "./store";

const LIMIT = 200;
const COALESCE_MS = 600;

interface Snapshot {
  doc: FacadeDocument;
  baseDoc: FacadeDocument;
  preset: PresetDef | null;
  locks: LockSet;
}

export const useHistory = create<{ canUndo: boolean; canRedo: boolean }>()(() => ({ canUndo: false, canRedo: false }));

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let applying = false;
let boundary = true;
let lastChange = 0;
let installed = false;

const snap = (s: AppState): Snapshot => ({ doc: s.doc, baseDoc: s.baseDoc, preset: s.preset, locks: s.locks });

function publish(): void {
  useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });
}

function apply(target: Snapshot): void {
  applying = true;
  const s = useApp.getState();
  const selected = target.doc.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : (target.doc.layers[0]?.id ?? null);
  const upTo = target.doc.layers.some((l) => l.id === s.view.previewUpTo) ? s.view.previewUpTo : null;
  useApp.setState({ ...target, selectedLayerId: selected, view: upTo === s.view.previewUpTo ? s.view : { ...s.view, previewUpTo: upTo } });
  applying = false;
  boundary = true;
  publish();
}

export function installHistory(): void {
  if (installed) return;
  installed = true;
  useApp.subscribe((s, prev) => {
    if (applying) return;
    if (s.doc === prev.doc && s.preset === prev.preset) return;
    const now = performance.now();
    // Loading a different preset/project is always its own step.
    if (boundary || now - lastChange > COALESCE_MS || s.preset !== prev.preset) {
      past.push(snap(prev));
      if (past.length > LIMIT) past.shift();
    }
    boundary = false;
    lastChange = now;
    future.length = 0;
    publish();
  });
  // A pointer release ends a gesture; the next change starts a new step.
  window.addEventListener("pointerup", () => (boundary = true), true);
}

export function undo(): void {
  const target = past.pop();
  if (!target) return;
  future.push(snap(useApp.getState()));
  apply(target);
}

export function redo(): void {
  const target = future.pop();
  if (!target) return;
  past.push(snap(useApp.getState()));
  apply(target);
}

/** Forces the next change to start a new undo step (e.g. before a discrete action). */
export function historyBoundary(): void {
  boundary = true;
}
