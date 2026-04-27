type PerfMarkDetail = Record<string, unknown> | undefined;

type PerfMarkEntry = {
  name: string;
  timestamp: number;
  detail?: PerfMarkDetail;
};

declare global {
  interface Window {
    __NEONEI_PERF_TIMELINE__?: PerfMarkEntry[];
  }
}

const PERF_TIMELINE_LIMIT = 256;

function getNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function markPerfEvent(name: string, detail?: PerfMarkDetail): void {
  const normalizedName = `${name ?? ''}`.trim();
  if (!normalizedName) {
    return;
  }

  const timestamp = getNow();
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    try {
      performance.mark(`neonei:${normalizedName}`);
    } catch {
      // ignore duplicate/unsupported mark errors
    }
  }

  if (typeof window !== 'undefined') {
    const timeline = window.__NEONEI_PERF_TIMELINE__ ?? [];
    timeline.push({ name: normalizedName, timestamp, detail });
    if (timeline.length > PERF_TIMELINE_LIMIT) {
      timeline.splice(0, timeline.length - PERF_TIMELINE_LIMIT);
    }
    window.__NEONEI_PERF_TIMELINE__ = timeline;
  }

  if (import.meta.env.DEV) {
    console.debug(`[perf-mark] ${normalizedName}`, detail ?? null);
  }
}

export function resetPerfTimeline(): void {
  if (typeof window !== 'undefined') {
    window.__NEONEI_PERF_TIMELINE__ = [];
  }
}
