/**
 * MP4 (H.264) / WebM (VP9) encoding with WebCodecs. Encoding uses the GPU's
 * hardware encoder when the platform exposes it (NVENC via Media Foundation
 * on Windows), so the weak CPU only muxes.
 */
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer";

export type VideoKind = "mp4" | "webm";

const CANDIDATES: Record<VideoKind, string[]> = {
  // High profile at increasing levels (5.1, 5.2, 6.0, 6.2) — 4096² needs level 6.
  mp4: ["avc1.640033", "avc1.640034", "avc1.64003C", "avc1.64003E"],
  webm: ["vp09.00.41.08", "vp09.00.51.08", "vp09.00.61.08", "vp8"],
};

export function videoSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

async function pickConfig(kind: VideoKind, width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig> {
  for (const hw of ["prefer-hardware", "no-preference"] as const) {
    for (const codec of CANDIDATES[kind]) {
      const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: "quality" };
      if (kind === "mp4") config.avc = { format: "avc" };
      try {
        const s = await VideoEncoder.isConfigSupported(config);
        if (s.supported) return s.config ?? config;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`No ${kind.toUpperCase()} encoder supports ${width}×${height} here. Try a smaller resolution or the other container.`);
}

export class VideoWriter {
  private encoder!: VideoEncoder;
  private muxer!: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget>;
  private error: Error | null = null;
  readonly width: number;
  readonly height: number;
  readonly codec: string = "";

  private constructor(
    readonly kind: VideoKind,
    srcWidth: number,
    srcHeight: number,
    readonly fps: number,
  ) {
    // Encoders need even dimensions; drop a trailing row/column if necessary.
    this.width = srcWidth & ~1;
    this.height = srcHeight & ~1;
  }

  static async create(kind: VideoKind, width: number, height: number, fps: number, mbps: number): Promise<VideoWriter> {
    if (!videoSupported()) throw new Error("WebCodecs video encoding is not available in this runtime.");
    const w = new VideoWriter(kind, width, height, fps);
    const config = await pickConfig(kind, w.width, w.height, fps, Math.round(mbps * 1e6));
    (w as { codec: string }).codec = config.codec;
    w.muxer =
      kind === "mp4"
        ? new Mp4Muxer({ target: new Mp4Target(), video: { codec: "avc", width: w.width, height: w.height, frameRate: fps }, fastStart: "in-memory" })
        : new WebmMuxer({ target: new WebmTarget(), video: { codec: config.codec.startsWith("vp8") ? "V_VP8" : "V_VP9", width: w.width, height: w.height, frameRate: fps } });
    w.encoder = new VideoEncoder({
      output: (chunk, meta) => w.muxer.addVideoChunk(chunk, meta),
      error: (e) => (w.error = e instanceof Error ? e : new Error(String(e))),
    });
    w.encoder.configure(config);
    return w;
  }

  /** `rgba` is a tightly packed RGBA8 frame of the source size. */
  async addFrame(rgba: Uint8Array, srcWidth: number, srcHeight: number, index: number): Promise<void> {
    if (this.error) throw this.error;
    while (this.encoder.encodeQueueSize > 6) {
      await new Promise((r) => this.encoder.addEventListener("dequeue", r, { once: true }));
    }
    const frameUs = 1e6 / this.fps;
    const frame = new VideoFrame(rgba, {
      format: "RGBA",
      codedWidth: srcWidth,
      codedHeight: srcHeight,
      visibleRect: { x: 0, y: 0, width: this.width, height: this.height },
      timestamp: Math.round(index * frameUs),
      duration: Math.round(frameUs),
    });
    this.encoder.encode(frame, { keyFrame: index % Math.max(1, Math.round(this.fps * 2)) === 0 });
    frame.close();
  }

  async finish(): Promise<Uint8Array> {
    await this.encoder.flush();
    this.encoder.close();
    if (this.error) throw this.error;
    this.muxer.finalize();
    return new Uint8Array(this.muxer.target.buffer);
  }

  abort(): void {
    try {
      this.encoder.close();
    } catch {
      /* already closed */
    }
  }
}
