import { onScopeDispose, shallowRef } from 'vue';

export function useRequest<T>() {
  const value = shallowRef<T | null>(null), error = shallowRef(''), loading = shallowRef(false);
  let controller: AbortController | null = null, sequence = 0;
  function cancel(): void { sequence++; controller?.abort(); controller = null; loading.value = false; }
  async function run(action: (signal: AbortSignal) => Promise<T>): Promise<void> {
    cancel();
    const request = ++sequence;
    controller = new AbortController();
    const signal = controller.signal;
    error.value = ''; loading.value = true;
    try {
      const result = await action(signal);
      if (request === sequence && !signal.aborted) value.value = result;
    } catch (failure) {
      if (request === sequence && !signal.aborted) error.value = failure instanceof Error ? failure.message : '加载失败';
    } finally { if (request === sequence) loading.value = false; }
  }
  function clear(): void { cancel(); value.value = null; error.value = ''; }
  onScopeDispose(cancel);
  return { value, error, loading, run, clear, cancel };
}
