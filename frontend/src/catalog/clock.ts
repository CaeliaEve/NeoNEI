/** One animation loop for visible consumers, suspended when the tab is hidden. */
class Clock {
  private readonly listeners = new Set<(elapsed: number) => void>();
  private frame = 0;
  private origin = 0;
  private started = false;
  private readonly visibility = (): void => {
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (!document.hidden && this.listeners.size) this.frame = requestAnimationFrame(this.draw);
  };
  private readonly draw = (time: number): void => {
    this.frame = 0;
    for (const listener of this.listeners) listener(time - this.origin);
    if (this.listeners.size && !document.hidden) this.frame = requestAnimationFrame(this.draw);
  };
  subscribe(listener: (elapsed: number) => void): () => void {
    if (!this.started) {
      this.started = true; this.origin = performance.now();
      document.addEventListener('visibilitychange', this.visibility);
    }
    this.listeners.add(listener);
    if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(this.draw);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        cancelAnimationFrame(this.frame); this.frame = 0; this.started = false;
        document.removeEventListener('visibilitychange', this.visibility);
      }
    };
  }
}

export const clock = new Clock();

/** All layers of a recipe share one phase; pausing keeps that phase without retaining an animation callback. */
export class Playback {
  private readonly listeners = new Set<(elapsed: number) => void>();
  private readonly source: (listener: (elapsed: number) => void) => () => void;
  private stop: (() => void) | undefined;
  private elapsed = 0;
  private active = true;

  constructor(source: (listener: (elapsed: number) => void) => () => void = listener => clock.subscribe(listener)) { this.source = source; }
  get time(): number { return this.elapsed; }
  set playing(value: boolean) {
    this.active = value;
    if (!value) { this.stop?.(); this.stop = undefined; }
    else this.start();
  }
  subscribe(listener: (elapsed: number) => void): () => void {
    this.listeners.add(listener); listener(this.elapsed); this.start();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.stop?.(); this.stop = undefined; }
    };
  }
  private start(): void {
    if (!this.active || !this.listeners.size || this.stop) return;
    let previous: number | undefined;
    this.stop = this.source(time => {
      if (previous != null) this.elapsed += Math.max(0, time - previous);
      previous = time;
      for (const listener of this.listeners) listener(this.elapsed);
    });
  }
  close(): void { this.playing = false; this.listeners.clear(); }
}
