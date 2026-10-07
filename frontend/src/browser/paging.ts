export function pageLoader<T>(read: (query: string, mod: string, offset: number, limit: number) => Promise<{rows: T[]; total: number}>,
  warm: (rows: T[], signal: AbortSignal) => Promise<void>) {
  let controller = new AbortController();
  return async (query: string, mod: string, offset: number, limit: number) => {
    controller.abort(); controller = new AbortController(); const signal = controller.signal;
    const result = await read(query, mod, offset, limit);
    if (!signal.aborted) void warm(result.rows, signal).catch(() => {});
    return result;
  };
}
