export interface PageBuffer<T> { value: T; dispose: () => void }

/** Keep the visible page until preparation succeeds; a late result never owns the screen. */
export function createPageBuffer<I, T>(
  prepare: (input: I, signal: AbortSignal) => Promise<PageBuffer<T>>,
  commit: (value: T) => void,
  failed: (error: unknown) => void,
  reuse?: {key:(input:I)=>unknown;capacity:number},
) {
  if(reuse&&(!Number.isSafeInteger(reuse.capacity)||reuse.capacity<1||reuse.capacity>8))throw new Error('Invalid prepared-page capacity');
  let pending: AbortController | null = null;
  let current: PageBuffer<T> | null = null;
  const recent=new Map<unknown,PageBuffer<T>>();
  let closed = false;
  function cancel() { pending?.abort(); pending = null; }
  async function stage(input: I) {
    if (closed) return;
    cancel();
    const key=reuse?.key(input),cached=reuse?recent.get(key):undefined;
    if(cached){recent.delete(key);recent.set(key,cached);current=cached;commit(cached.value);return;}
    // Release optional old pages before allocating a new native-pixel buffer.
    if(reuse&&recent.size>=reuse.capacity){
      for(const [oldKey,old]of recent){if(old===current)continue;recent.delete(oldKey);old.dispose();break;}
    }
    const controller = new AbortController();
    pending = controller;
    try {
      const prepared = await prepare(input, controller.signal);
      if (closed || controller.signal.aborted || pending !== controller) { prepared.dispose(); return; }
      const old = current;
      current = prepared;
      if(reuse){recent.set(key,prepared);while(recent.size>reuse.capacity){const [oldKey,old]=recent.entries().next().value!;recent.delete(oldKey);old.dispose();}}
      commit(prepared.value);
      if(!reuse)old?.dispose();
    } catch (error) {
      if (!closed && !controller.signal.aborted && pending === controller) failed(error);
    } finally {
      if (pending === controller) pending = null;
    }
  }
  return {stage, cancel, close() { closed = true; cancel();
    const owned=new Set(recent.values());if(current)owned.add(current);recent.clear();current=null;for(const page of owned)page.dispose();
  }};
}
