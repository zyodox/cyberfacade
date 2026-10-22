import { create } from "zustand";
import { compileFrame } from "../procedural/compile";
import { presetToDocument } from "../presets/normalize";
import type { PresetDef } from "../presets/types";
import type { Renderer } from "../renderer/types";

/** Thumbnail data URLs by preset id (observable from React). */
export const useThumbnails = create<Record<string, string>>()(() => ({}));

const THUMB_W = 120;
const THUMB_PHASE = 0.35;

/**
 * Renders preset thumbnails on the GPU one at a time (tiny readback each), so
 * the browser stays responsive and the preview keeps priority.
 */
export class ThumbnailService {
  private queue: PresetDef[] = [];
  private busy = false;
  private readonly canvas = document.createElement("canvas");

  constructor(private readonly renderer: Renderer) {}

  request(presets: PresetDef[]): void {
    const have = useThumbnails.getState();
    for (const p of presets) {
      if (!have[p.id] && !this.queue.some((q) => q.id === p.id)) this.queue.push(p);
    }
    void this.pump();
  }

  invalidate(id: string): void {
    useThumbnails.setState((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    }, true);
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const preset = this.queue.shift()!;
        const doc = presetToDocument(preset);
        const aspect = doc.output.height / doc.output.width;
        const w = THUMB_W;
        const h = Math.max(32, Math.min(320, Math.round(w * aspect)));
        const frame = compileFrame(doc, w, h, { phase: THUMB_PHASE, seconds: THUMB_PHASE * doc.animation.duration });
        const img = await this.renderer.renderThumbnail(frame, doc.look.exposure + Math.log2(Math.max(doc.look.emission, 1e-3)), doc.look.tonemap);
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.canvas.getContext("2d")!.putImageData(img, 0, 0);
        const url = this.canvas.toDataURL("image/png");
        useThumbnails.setState({ [preset.id]: url });
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err) {
      console.error("Thumbnail rendering failed", err);
    } finally {
      this.busy = false;
    }
  }
}
