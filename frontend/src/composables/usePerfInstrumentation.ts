import { ref } from 'vue';

const canMeasure = typeof performance !== 'undefined' && typeof performance.now === 'function';

const now = (): number => {
  return canMeasure ? performance.now() : Date.now();
};

export const usePerfInstrumentation = (namespace: string) => {
  const marks = new Map<string, number>();
  const lastDurations = ref<Record<string, number>>({});

  const start = (label: string) => {
    marks.set(label, now());
  };

  const end = (label: string): number | null => {
    const startedAt = marks.get(label);
    if (startedAt === undefined) {
      return null;
    }

    const duration = now() - startedAt;
    marks.delete(label);
    lastDurations.value = {
      ...lastDurations.value,
      [`${namespace}:${label}`]: duration,
    };

    if (import.meta.env.DEV) {
      console.debug(`[perf] ${namespace}:${label}`, `${duration.toFixed(2)}ms`);
    }

    return duration;
  };

  const measureAsync = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
    start(label);
    try {
      return await task();
    } finally {
      end(label);
    }
  };

  return {
    start,
    end,
    measureAsync,
    lastDurations,
  };
};
