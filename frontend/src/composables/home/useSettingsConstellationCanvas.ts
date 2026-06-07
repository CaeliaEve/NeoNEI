import { nextTick, onBeforeUnmount, ref, watch, type ComputedRef } from "vue";

interface SettingsStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  phaseSpeed: number;
}

const SETTINGS_STAR_COUNT = 28;
const SETTINGS_CONNECTION_DIST = 80;
const SETTINGS_ANIMATION_START_DELAY_MS = 120;
const SETTINGS_FRAME_INTERVAL_MS = 1000 / 30;

export function useSettingsConstellationCanvas(isOpen: ComputedRef<boolean>) {
  const settingsBgCanvas = ref<HTMLCanvasElement | null>(null);
  const settingsUiRoot = ref<HTMLElement | null>(null);
  let settingsAnimFrameId = 0;
  let settingsResizeObs: ResizeObserver | null = null;
  let settingsStartTimer = 0;
  let settingsLastFrameMs = 0;
  let settingsStars: SettingsStar[] = [];
  let settingsCW = 0;
  let settingsCH = 0;

  const initSettingsStars = () => {
    settingsStars = [];
    for (let i = 0; i < SETTINGS_STAR_COUNT; i += 1) {
      settingsStars.push({
        x: Math.random() * settingsCW,
        y: Math.random() * settingsCH,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: 0.6 + Math.random() * 1.4,
        baseAlpha: 0.15 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.002 + Math.random() * 0.006,
      });
    }
  };

  const drawSettingsConstellations = () => {
    const canvas = settingsBgCanvas.value;
    if (!canvas) return;
    const frameNow = performance.now();
    if (settingsLastFrameMs > 0 && frameNow - settingsLastFrameMs < SETTINGS_FRAME_INTERVAL_MS) {
      settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
      return;
    }
    settingsLastFrameMs = frameNow;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, settingsCW, settingsCH);
    const now = performance.now() * 0.001;

    for (const s of settingsStars) {
      s.phase += s.phaseSpeed;
      s.x += s.vx + Math.sin(s.phase) * 0.05;
      s.y += s.vy + Math.cos(s.phase * 0.7) * 0.04;

      if (s.x < -20) s.x = settingsCW + 20;
      if (s.x > settingsCW + 20) s.x = -20;
      if (s.y < -20) s.y = settingsCH + 20;
      if (s.y > settingsCH + 20) s.y = -20;
    }

    for (let i = 0; i < settingsStars.length; i += 1) {
      for (let j = i + 1; j < settingsStars.length; j += 1) {
        const a = settingsStars[i];
        const b = settingsStars[j];
        const ddx = a.x - b.x;
        const ddy = a.y - b.y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < SETTINGS_CONNECTION_DIST) {
          const alpha = (1 - d / SETTINGS_CONNECTION_DIST) * 0.15;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(148, 180, 220, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    for (const s of settingsStars) {
      const twinkle = s.baseAlpha + Math.sin(now * 1.5 + s.phase) * 0.08;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 200, 230, ${twinkle})`;
      ctx.fill();
      if (s.radius > 1) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148, 180, 220, ${twinkle * 0.12})`;
        ctx.fill();
      }
    }
    settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
  };

  const handleSettingsCanvasResize = () => {
    const el = settingsUiRoot.value;
    const canvas = settingsBgCanvas.value;
    if (!el || !canvas) return;
    const rect = el.getBoundingClientRect();
    const oldW = settingsCW;
    settingsCW = rect.width;
    settingsCH = rect.height;
    canvas.width = settingsCW;
    canvas.height = settingsCH;
    if (settingsStars.length === 0 || (oldW === 0 && settingsCW > 0)) initSettingsStars();
  };

  const startSettingsAnimation = () => {
    window.clearTimeout(settingsStartTimer);
    nextTick(() => {
      settingsStartTimer = window.setTimeout(() => {
        handleSettingsCanvasResize();
        if (!settingsResizeObs && settingsUiRoot.value) {
          settingsResizeObs = new ResizeObserver(handleSettingsCanvasResize);
          settingsResizeObs.observe(settingsUiRoot.value);
        }
        settingsLastFrameMs = 0;
        cancelAnimationFrame(settingsAnimFrameId);
        settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
      }, SETTINGS_ANIMATION_START_DELAY_MS);
    });
  };

  const stopSettingsAnimation = () => {
    window.clearTimeout(settingsStartTimer);
    settingsStartTimer = 0;
    cancelAnimationFrame(settingsAnimFrameId);
    settingsAnimFrameId = 0;
    settingsLastFrameMs = 0;
    if (settingsResizeObs) {
      settingsResizeObs.disconnect();
      settingsResizeObs = null;
    }
  };

  watch(isOpen, (newVal) => {
    if (newVal) {
      startSettingsAnimation();
    } else {
      stopSettingsAnimation();
    }
  });

  onBeforeUnmount(() => {
    stopSettingsAnimation();
  });

  return {
    settingsBgCanvas,
    settingsUiRoot,
    startSettingsAnimation,
    stopSettingsAnimation,
  };
}
