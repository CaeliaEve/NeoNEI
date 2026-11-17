export const PANEL_LAYOUT_KEY = 'neonei:panel-layout:v1';
export interface PanelLayout { browserWidth: number | null; historyHeight: number | null; resizeEnabled: boolean }
export interface SizeBounds { min: number; max: number }

const preference = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 64 && value <= 10000 ? value : null;

export function readPanelLayout(raw: string | null): PanelLayout {
  try {
    const value = JSON.parse(raw ?? 'null');
    return {browserWidth: preference(value?.browserWidth), historyHeight: preference(value?.historyHeight), resizeEnabled: value?.resizeEnabled === true};
  } catch { return {browserWidth: null, historyHeight: null, resizeEnabled: false}; }
}

export function panelBounds(width: number, height: number, itemSize: number) {
  const browserMax = Math.max(1, width - Math.min(320, width * 0.42) - 16);
  const historyMax = Math.max(1, Math.min(height * 0.65, height - 180));
  return {
    browser: {min: Math.min(240, width * .44, browserMax), max: browserMax},
    history: {min: Math.min(Math.min(itemSize, 56) + 48, historyMax), max: historyMax},
  };
}

export const clampPanelSize = (value: number, bounds: SizeBounds) =>
  Math.round(Math.min(bounds.max, Math.max(bounds.min, value)));

export const historyRowCount = (height: number, itemSize: number) =>
  Math.max(1, Math.floor((height - 48 + 4) / (Math.min(itemSize, 56) + 4)));
