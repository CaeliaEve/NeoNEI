export class NativeSurfaceLifecycle {
  private generation = 0;
  private active = false;

  beginInitialize(): number {
    this.generation += 1;
    this.active = false;
    return this.generation;
  }

  completeInitialize(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.active = true;
    return true;
  }

  rollbackInitialize(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.generation += 1;
    this.active = false;
    return true;
  }

  destroy(): void {
    this.generation += 1;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  isCurrent(generation: number): boolean {
    return this.active && generation === this.generation;
  }
}
