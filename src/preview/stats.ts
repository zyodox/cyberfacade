import { create } from "zustand";

export interface PreviewStats {
  fps: number;
  renderWidth: number;
  renderHeight: number;
  /** "interactive" proxy or "full" (idle refinement). */
  mode: "interactive" | "full";
}

/** Updated a few times per second by the preview controller. */
export const usePreviewStats = create<PreviewStats>()(() => ({ fps: 0, renderWidth: 0, renderHeight: 0, mode: "interactive" }));
