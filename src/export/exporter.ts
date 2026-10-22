/**
 * Offline export: renders every frame of the loop at full resolution on the
 * GPU, reads back only the requested channels and streams them to native
 * encoders. GPU work for frame N+1 overlaps with encoding of frame N.
 */
import { loopPhase } from "../animation/clock";
import { applyAudio, type Bands } from "../audio/modulation";
import { isDesktop, joinPath, pathExists, safeFileName, writeBinaryFile, writeImageFile } from "../platform/native";
import { FrameCompiler } from "../procedural/compile";
import type { FacadeDocument } from "../procedural/types";
import type { OutputChannel, ReadResult, Renderer } from "../renderer/types";
import { VideoWriter, type VideoKind } from "./video";

export interface ExportSettings {
  folder: string;
  baseName: string;
  width: number;
  height: number;
  fps: number;
  /** Export a single still at `stillSeconds` instead of the whole loop. */
  still: boolean;
  stillSeconds: number;
  color: boolean;
  emission: boolean;
  mask: boolean;
  alpha: boolean;
  emissionFormat: "exr" | "png";
  maskFormat: "png" | "exr";
  video: "none" | VideoKind;
  videoMbps: number;
}

export interface ExportProgress {
  frame: number;
  frames: number;
  elapsedMs: number;
  etaMs: number;
  stage: string;
}

export interface ExportSummary {
  frames: number;
  files: number;
  folder: string;
  /** Base name actually used ("<name>" or "<name>_2", "_3"… when earlier exports exist). */
  name: string;
  elapsedMs: number;
  video?: string;
}

const MAX_INFLIGHT_WRITES = 6;

function pad(n: number, digits = 4): string {
  return String(n).padStart(digits, "0");
}

/** RGBA → first channel only (mask / alpha are grey). */
function extractFirst(r: ReadResult): Uint8Array {
  const bpp = r.hdr ? 8 : 4;
  const sampleBytes = r.hdr ? 2 : 1;
  const n = r.width * r.height;
  const out = new Uint8Array(n * sampleBytes);
  const src = r.data;
  if (sampleBytes === 1) for (let i = 0; i < n; i++) out[i] = src[i * bpp];
  else
    for (let i = 0; i < n; i++) {
      out[i * 2] = src[i * bpp];
      out[i * 2 + 1] = src[i * bpp + 1];
    }
  return out;
}

function stripAlpha(r: ReadResult): Uint8Array {
  const n = r.width * r.height;
  const out = new Uint8Array(n * 3);
  const src = r.data;
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) {
    out[k] = src[j];
    out[k + 1] = src[j + 1];
    out[k + 2] = src[j + 2];
  }
  return out;
}

/** File extension a channel is written with. */
function channelExt(ch: OutputChannel, s: ExportSettings): string {
  if (ch === "emission") return s.emissionFormat === "exr" ? "exr" : "png";
  if (ch === "mask") return s.maskFormat === "exr" ? "exr" : "png";
  return "png";
}

/**
 * First of "<name>", "<name>_2", "<name>_3"… for which none of this export's
 * files (video, stills) or sequence folders exist yet — exports never
 * overwrite earlier ones.
 */
async function freeBaseName(base: string, s: ExportSettings, channels: OutputChannel[], video: boolean): Promise<string> {
  if (!isDesktop()) return base;
  const outputs = (b: string) => [
    ...(video ? [joinPath(s.folder, `${b}.${s.video}`)] : []),
    ...channels.map((ch) => (s.still ? joinPath(s.folder, `${b}_${ch}.${channelExt(ch, s)}`) : joinPath(s.folder, `${b}_${ch}`))),
  ];
  for (let k = 1; k < 10000; k++) {
    const b = k === 1 ? base : `${base}_${k}`;
    const taken = await Promise.all(outputs(b).map(pathExists));
    if (!taken.some(Boolean)) return b;
  }
  return `${base}_${Date.now()}`;
}

export function exportFrameCount(doc: FacadeDocument, s: Pick<ExportSettings, "still" | "fps">): number {
  return s.still ? 1 : Math.max(1, Math.round(doc.animation.duration * s.fps));
}

export async function runExport(
  renderer: Renderer,
  doc: FacadeDocument,
  s: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
  /** Audio bands by time (seconds) for audio-reactive routes; sampled per frame, so exports stay deterministic. */
  audioAt?: (seconds: number) => Bands,
): Promise<ExportSummary> {
  const max = renderer.info.maxTextureSize;
  if (s.width > max || s.height > max) throw new Error(`Resolution exceeds the GPU limit of ${max}px.`);
  const channels = (["color", "emission", "mask", "alpha"] as OutputChannel[]).filter((c) => s[c]);
  if (!channels.length && s.video === "none") throw new Error("Nothing to export — enable at least one channel or a video.");

  const base = await freeBaseName(safeFileName(s.baseName), s, channels, s.video !== "none" && !s.still);
  const frames = exportFrameCount(doc, s);
  const compiler = new FrameCompiler();
  const video = s.video !== "none" && !s.still ? await VideoWriter.create(s.video, s.width, s.height, s.fps, s.videoMbps) : null;
  const inflight = new Set<Promise<void>>();
  let files = 0;
  let firstError: unknown = null;
  const t0 = performance.now();

  const track = (p: Promise<void>) => {
    const q = p
      .then(() => void files++)
      .catch((e) => void (firstError ??= e))
      .finally(() => inflight.delete(q));
    inflight.add(q);
  };

  const fileFor = (ch: OutputChannel, ext: string, i: number) =>
    s.still ? joinPath(s.folder, `${base}_${ch}.${ext}`) : joinPath(s.folder, `${base}_${ch}`, `${base}_${ch}_${pad(i + 1)}.${ext}`);

  const look = { emission: doc.look.emission, exposure: doc.look.exposure, tonemap: doc.look.tonemap };

  try {
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (firstError) throw firstError;
      while (inflight.size >= MAX_INFLIGHT_WRITES) await Promise.race(inflight);

      // Frame i of N samples phase i/N: the sequence loops seamlessly (phase 1 ≡ phase 0).
      const seconds = s.still ? s.stillSeconds : (i / frames) * doc.animation.duration;
      const phase = s.still ? loopPhase(seconds, doc.animation.duration) : i / frames;
      const frameDoc = audioAt && doc.audio.routes.length ? applyAudio(doc, audioAt(s.still ? s.stillSeconds : i / s.fps)) : doc;
      const frame = compiler.compile(frameDoc, s.width, s.height, { phase, seconds });
      // Seek videos / decode images / load fonts so every frame is exact.
      if (frame.layers.some((l) => l.media)) await renderer.prepare(frame, "export");
      const handle = renderer.render(frame, "export");

      // Queue every readback for this frame before awaiting any of them.
      const needColor = s.color || !!video;
      const reads: Promise<void>[] = [];
      if (needColor) {
        reads.push(
          renderer.readChannel(handle, { channel: "color", hdr: false, ...look }).then(async (r) => {
            if (video) await video.addFrame(r.data, r.width, r.height, i);
            if (s.color) track(writeImageFile(fileFor("color", "png", i), "png8", r.width, r.height, 3, stripAlpha(r)));
          }),
        );
      }
      if (s.emission) {
        const hdr = s.emissionFormat === "exr";
        reads.push(
          renderer.readChannel(handle, { channel: "emission", hdr, ...look }).then((r) => {
            track(writeImageFile(fileFor("emission", hdr ? "exr" : "png", i), hdr ? "exr" : "png8", r.width, r.height, 4, r.data));
          }),
        );
      }
      if (s.mask) {
        const hdr = s.maskFormat === "exr";
        reads.push(
          renderer.readChannel(handle, { channel: "mask", hdr, ...look }).then((r) => {
            track(writeImageFile(fileFor("mask", hdr ? "exr" : "png", i), hdr ? "exr" : "png8", r.width, r.height, 1, extractFirst(r)));
          }),
        );
      }
      if (s.alpha) {
        reads.push(
          renderer.readChannel(handle, { channel: "alpha", hdr: false, ...look }).then((r) => {
            track(writeImageFile(fileFor("alpha", "png", i), "png8", r.width, r.height, 1, extractFirst(r)));
          }),
        );
      }
      await Promise.all(reads);

      const elapsed = performance.now() - t0;
      onProgress({ frame: i + 1, frames, elapsedMs: elapsed, etaMs: (elapsed / (i + 1)) * (frames - i - 1), stage: "Rendering" });
    }

    onProgress({ frame: frames, frames, elapsedMs: performance.now() - t0, etaMs: 0, stage: "Writing files" });
    await Promise.all(inflight);
    if (firstError) throw firstError;

    let videoPath: string | undefined;
    if (video) {
      onProgress({ frame: frames, frames, elapsedMs: performance.now() - t0, etaMs: 0, stage: "Finalizing video" });
      const bytes = await video.finish();
      videoPath = joinPath(s.folder, `${base}.${video.kind}`);
      await writeBinaryFile(videoPath, bytes);
      files++;
    }
    return { frames, files, folder: s.folder, name: base, elapsedMs: performance.now() - t0, video: videoPath };
  } catch (e) {
    video?.abort();
    await Promise.allSettled(inflight);
    throw e;
  }
}
