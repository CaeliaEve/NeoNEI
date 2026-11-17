type Snapshot = { manifest: { id: string }; offline: boolean; close(): void };
type Slot<T> = { id: string; offline: boolean; locale: string; controller: AbortController; value?: T; pending: Promise<T> };

/** The workspace owns one snapshot. Consumer cancellation never closes a peer's atlas. */
export class SnapshotSession<T extends Snapshot> {
  private slot: Slot<T> | null = null;
  private readonly start: (id: string, offline: boolean, signal: AbortSignal, locale: string) => Promise<T>;

  constructor(start: (id: string, offline: boolean, signal: AbortSignal, locale: string) => Promise<T>) {
    this.start = start;
  }

  open(id: string, offline: boolean, signal?: AbortSignal, locale = ''): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let slot = this.slot;
    const sameId = slot && (id === slot.id || id === slot.value?.manifest.id);
    if (slot && sameId && locale === slot.locale && (offline === slot.offline || offline === slot.value?.offline)) {
      // Bind a network fallback to its actual offline source when the route follows it.
      slot.offline = offline;
    } else {
      this.close();
      const controller = new AbortController();
      slot = { id, offline, locale, controller, pending: null as unknown as Promise<T> };
      this.slot = slot;
      const selected = slot;
      selected.pending = this.start(id, offline, controller.signal, locale).then(value => {
        if (this.slot !== selected || controller.signal.aborted) {
          value.close();
          throw new DOMException('Snapshot changed', 'AbortError');
        }
        selected.value = value;
        return value;
      }).catch(error => {
        if (this.slot === selected) this.slot = null;
        throw error;
      });
    }
    const pending = slot.pending;
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      pending.then(value => signal.aborted ? reject(signal.reason) : resolve(value), reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  }

  invalidate(id: string): void {
    if (this.slot?.value?.manifest.id === id) this.close();
  }

  close(): void {
    const slot = this.slot;
    this.slot = null;
    slot?.controller.abort();
    slot?.value?.close();
  }
}
