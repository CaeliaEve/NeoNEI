import { ref } from 'vue';

interface PositionOptions {
  gap?: number;
  viewportPadding?: number;
}

export function useFloatingTooltip(options: PositionOptions = {}) {
  const tooltipX = ref(0);
  const tooltipY = ref(0);

  const gap = options.gap ?? 14;
  const viewportPadding = options.viewportPadding ?? 10;

  const updatePosition = (event: MouseEvent, tooltipEl: HTMLElement | null) => {
    let x = event.clientX + gap;
    let y = event.clientY + gap;

    if (!tooltipEl) {
      tooltipX.value = x;
      tooltipY.value = y;
      return;
    }

    const rect = tooltipEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + rect.width + viewportPadding > viewportWidth) {
      x = event.clientX - rect.width - gap;
    }
    if (y + rect.height + viewportPadding > viewportHeight) {
      y = event.clientY - rect.height - gap;
    }

    x = Math.max(viewportPadding, x);
    y = Math.max(viewportPadding, y);

    tooltipX.value = x;
    tooltipY.value = y;
  };

  return {
    tooltipX,
    tooltipY,
    updatePosition,
  };
}

