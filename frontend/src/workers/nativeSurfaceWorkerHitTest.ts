import type {
  NativeSurfaceEngineHit,
  NativeSurfaceEngineRequest,
} from '../native-surface/NativeSurfaceEngineProtocol';
import type { SurfaceState } from './nativeSurfaceWorkerState';

type NativeWasmHitTestEngine = {
  neonei_engine_hit_test_index?: (
    x: number,
    y: number,
    viewportWidth: number,
    itemSize: number,
    gap: number,
    entryCount: number,
  ) => number;
};

function toU32(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function hitTestNativeSurface(
  surface: SurfaceState,
  message: Extract<NativeSurfaceEngineRequest, { type: 'hitTest' }>,
  wasmEngine: NativeWasmHitTestEngine | null,
): NativeSurfaceEngineHit {
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const gap = 4;
  const nativeIndex = wasmEngine?.neonei_engine_hit_test_index?.(
    toU32(message.x),
    toU32(message.y),
    toU32(viewportWidth),
    toU32(cardSize),
    toU32(gap),
    toU32(surface.layoutCommands.length),
  );
  const hit = Number.isInteger(nativeIndex) && nativeIndex >= 0
    ? surface.layoutCommands[nativeIndex]
    : null;
  if (!hit) {
    surface.lastHit = null;
    return null;
  }
  surface.lastHit = {
    key: hit.key,
    kind: hit.kind,
    entryIndex: hit.entryIndex,
    itemId: hit.itemId,
    groupKey: hit.groupKey ?? null,
    viewport: message.viewport,
    tooltip: {
      itemId: hit.itemId,
      publicItemId: surface.searchByItemId.get(hit.itemId)?.publicItemId ?? null,
      ...(surface.stringByItemId.get(hit.itemId) ?? {}),
      groupKey: hit.groupKey ?? surface.stringByItemId.get(hit.itemId)?.groupKey ?? null,
      groupLabel: surface.groupByKey.get(hit.groupKey ?? '')?.groupLabel
        ?? surface.stringByItemId.get(hit.itemId)?.groupLabel
        ?? null,
      groupSize: surface.groupByKey.get(hit.groupKey ?? '')?.groupSize ?? null,
    },
  };
  return surface.lastHit;
}
