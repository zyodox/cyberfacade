/**
 * Playback clock. Kept outside React state: it changes every frame and only the
 * timeline needs to observe it. Shaders never see seconds — only the normalized
 * loop phase, which makes animation frame-rate independent and loops exact.
 */
type Listener = () => void;

class Clock {
  private t = 0;
  private listeners = new Set<Listener>();

  get time(): number {
    return this.t;
  }

  set(t: number): void {
    if (t === this.t) return;
    this.t = t;
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): number => this.t;
}

export const clock = new Clock();

/** Normalized phase in [0, 1). phase(duration) === phase(0), so loops are seamless. */
export function loopPhase(seconds: number, duration: number): number {
  const d = Math.max(duration, 1e-3);
  const p = (seconds % d) / d;
  return p < 0 ? p + 1 : p;
}
