/**
 * Audio input for audio-reactive facades.
 *
 * Files are analysed once, offline: an OfflineAudioContext renders low / mid /
 * high filter banks natively (cheap on a weak CPU), then RMS envelopes are
 * taken at 60 Hz, normalized to their 95th percentile and smoothed. Playback
 * and export sample those envelopes by time, so exports are deterministic.
 * The microphone uses a live AnalyserNode with automatic gain.
 */
import { create } from "zustand";
import { SILENT, type Bands } from "./modulation";

const ENV_RATE = 60;

interface Envelopes {
  bass: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  level: Float32Array;
}

export interface AudioState {
  source: "none" | "file" | "mic";
  name: string;
  duration: number;
  analyzing: boolean;
  error: string | null;
}

export const useAudio = create<AudioState>()(() => ({ source: "none", name: "", duration: 0, analyzing: false, error: null }));

class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private env: Envelopes | null = null;
  private player: AudioBufferSourceNode | null = null;
  private playStartedAt = 0; // ctx time when playback (re)started
  private position = 0; // seconds into the file while paused
  private mic: { stream: MediaStream; analyser: AnalyserNode; bins: Float32Array; peak: Bands } | null = null;
  private live: Bands = { ...SILENT };

  private context(): AudioContext {
    this.ctx ??= new AudioContext();
    return this.ctx;
  }

  get active(): boolean {
    return useAudio.getState().source !== "none";
  }

  async loadFile(file: File): Promise<void> {
    this.stop();
    useAudio.setState({ analyzing: true, error: null });
    try {
      const data = await file.arrayBuffer();
      const buffer = await this.context().decodeAudioData(data);
      this.env = await analyze(buffer);
      this.buffer = buffer;
      this.position = 0;
      useAudio.setState({ source: "file", name: file.name, duration: buffer.duration, analyzing: false });
    } catch (e) {
      useAudio.setState({ analyzing: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async useMicrophone(): Promise<void> {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = this.context();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      this.mic = { stream, analyser, bins: new Float32Array(analyser.frequencyBinCount), peak: { bass: 1e-3, mid: 1e-3, high: 1e-3, level: 1e-3 } };
      useAudio.setState({ source: "mic", name: "Microphone", duration: 0, error: null });
    } catch (e) {
      useAudio.setState({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  clear(): void {
    this.stop();
    this.mic?.stream.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.buffer = null;
    this.env = null;
    this.live = { ...SILENT };
    useAudio.setState({ source: "none", name: "", duration: 0, error: null });
  }

  /** Follow the app's play state (file playback only). */
  setPlaying(playing: boolean): void {
    if (!this.buffer) return;
    if (playing && !this.player) {
      const ctx = this.context();
      void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.loop = true;
      src.connect(ctx.destination);
      src.start(0, this.position % this.buffer.duration);
      this.playStartedAt = ctx.currentTime - this.position;
      this.player = src;
    } else if (!playing && this.player) {
      this.position = this.currentTime();
      this.stop();
    }
  }

  restart(): void {
    const wasPlaying = !!this.player;
    this.stop();
    this.position = 0;
    if (wasPlaying) this.setPlaying(true);
  }

  private stop(): void {
    try {
      this.player?.stop();
    } catch {
      /* not started */
    }
    this.player?.disconnect();
    this.player = null;
  }

  currentTime(): number {
    if (!this.buffer) return 0;
    if (!this.player || !this.ctx) return this.position;
    return (this.ctx.currentTime - this.playStartedAt) % this.buffer.duration;
  }

  /** Bands at an explicit time (export) — files only. */
  bandsAt(seconds: number): Bands {
    if (!this.env) return SILENT;
    const n = this.env.level.length;
    const f = Math.min(n - 1, Math.max(0, seconds * ENV_RATE));
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    const t = f - i;
    const lerp = (a: Float32Array) => a[i] + (a[j] - a[i]) * t;
    return { bass: lerp(this.env.bass), mid: lerp(this.env.mid), high: lerp(this.env.high), level: lerp(this.env.level) };
  }

  /** Current bands for the live preview. */
  bands(): Bands {
    if (this.env) return this.bandsAt(this.currentTime());
    if (this.mic) {
      const { analyser, bins, peak } = this.mic;
      analyser.getFloatFrequencyData(bins as Float32Array<ArrayBuffer>);
      const hz = (this.ctx?.sampleRate ?? 48000) / 2 / bins.length;
      const band = (lo: number, hi: number) => {
        let s = 0;
        let n = 0;
        for (let k = Math.floor(lo / hz); k <= Math.min(bins.length - 1, Math.ceil(hi / hz)); k++, n++) s += Math.pow(10, bins[k] / 20);
        return n ? s / n : 0;
      };
      const raw: Bands = { bass: band(30, 160), mid: band(300, 2500), high: band(4000, 12000), level: band(30, 12000) };
      for (const k of Object.keys(raw) as (keyof Bands)[]) {
        peak[k] = Math.max(raw[k], peak[k] * 0.9995); // slow-decay automatic gain
        const v = Math.min(1, raw[k] / Math.max(peak[k], 1e-4));
        this.live[k] = v > this.live[k] ? v : this.live[k] * 0.85 + v * 0.15;
      }
      return this.live;
    }
    return SILENT;
  }
}

async function analyze(buffer: AudioBuffer): Promise<Envelopes> {
  const off = new OfflineAudioContext(4, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const merger = off.createChannelMerger(4);
  const chain = (type: BiquadFilterType, freq: number, q: number, input: number) => {
    const f = off.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(merger, 0, input);
  };
  chain("lowpass", 160, 0.7, 0);
  chain("bandpass", 1000, 0.6, 1);
  chain("highpass", 4000, 0.7, 2);
  src.connect(merger, 0, 3);
  merger.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();

  const win = Math.max(1, Math.round(buffer.sampleRate / ENV_RATE));
  const frames = Math.ceil(buffer.length / win);
  const envelope = (ch: number, attack: number, release: number) => {
    const d = rendered.getChannelData(ch);
    const out = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let s = 0;
      const end = Math.min(d.length, (f + 1) * win);
      for (let k = f * win; k < end; k++) s += d[k] * d[k];
      out[f] = Math.sqrt(s / Math.max(1, end - f * win));
    }
    // Normalize to the 95th percentile, then attack/release smoothing.
    const sorted = Float32Array.from(out).sort();
    const ref = Math.max(sorted[Math.floor(sorted.length * 0.95)] ?? 1, 1e-5);
    let prev = 0;
    for (let f = 0; f < frames; f++) {
      const v = Math.min(1, out[f] / ref);
      prev = v > prev ? prev + (v - prev) * attack : prev + (v - prev) * release;
      out[f] = prev;
    }
    return out;
  };
  return { bass: envelope(0, 0.6, 0.12), mid: envelope(1, 0.5, 0.15), high: envelope(2, 0.7, 0.25), level: envelope(3, 0.5, 0.1) };
}

export const audioEngine = new AudioEngine();
