export const INTERACTION_COMMIT_DELAY_MS = 16;

export type BrowserInteractionTask = () => void;

export type BrowserInteractionScheduler = {
  scheduleSearchCommit: (task: BrowserInteractionTask) => void;
  schedulePageHydration: (task: BrowserInteractionTask) => void;
  clear: () => void;
};

function clearTimer(timer: ReturnType<typeof setTimeout> | number | null): void {
  if (timer === null) {
    return;
  }
  clearTimeout(timer as ReturnType<typeof setTimeout>);
}

export function createBrowserInteractionScheduler(
  delayMs: number = INTERACTION_COMMIT_DELAY_MS,
): BrowserInteractionScheduler {
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let pageHydrationTimer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (
    current: ReturnType<typeof setTimeout> | null,
    setCurrent: (timer: ReturnType<typeof setTimeout> | null) => void,
    task: BrowserInteractionTask,
  ) => {
    clearTimer(current);
    const timer = setTimeout(() => {
      setCurrent(null);
      task();
    }, delayMs);
    setCurrent(timer);
  };

  return {
    scheduleSearchCommit(task) {
      schedule(searchTimer, (timer) => { searchTimer = timer; }, task);
    },
    schedulePageHydration(task) {
      schedule(pageHydrationTimer, (timer) => { pageHydrationTimer = timer; }, task);
    },
    clear() {
      clearTimer(searchTimer);
      clearTimer(pageHydrationTimer);
      searchTimer = null;
      pageHydrationTimer = null;
    },
  };
}
