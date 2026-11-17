/** Presentation only: never delay data, clicks, or navigation behind an animation. */
export function createPageTransition({
  now = () => performance.now(), reducedMotion = () => false,
}: {now?: () => number; reducedMotion?: () => boolean} = {}) {
  let previous: {page: number; context: string; time: number} | null = null;
  let active: Animation | null = null;
  function cancel() {
    const old = active;
    active = null;
    old?.cancel();
  }
  function present(grid: Pick<HTMLElement, 'animate'> | null, page: number, context: string, skip = false) {
    cancel();
    const time = now(), old = previous;
    previous = {page, context, time};
    if (skip || !old || old.page === page || old.context !== context || time - old.time < 160
      || reducedMotion() || typeof grid?.animate !== 'function') return;
    const animation = grid.animate([{opacity: .72}, {opacity: 1}], {
      duration: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    active = animation;
    const release = () => { if (active === animation) active = null; };
    void animation.finished.then(release, release);
  }
  return {present, cancel};
}
