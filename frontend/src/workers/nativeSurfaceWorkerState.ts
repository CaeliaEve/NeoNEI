import type {
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineHit,
  NativeSurfaceEngineLayoutCommand,
} from '../native-surface/NativeSurfaceEngineProtocol';
import type { NativeSurfaceMetricsSurface } from './nativeSurfaceMetrics';
import type {
  NativeRendererBackendKind,
  NativeSurfaceViewport,
} from '../native-surface/contracts';
import type { NativeCompactBrowserPack } from '../native-surface/NativeRuntimeBrowserPack';
import type {
  NativeRuntimeAnimationItem,
  NativeRuntimeTextureItem,
} from './nativeSurfaceSpriteTimeline';
import type {
  NativeRuntimeGroup,
  NativeRuntimeSearchItem,
  NativeRuntimeStringItem,
} from './nativeSurfaceRuntimeParsers';

export type SurfaceState = {
  initialized: boolean;
  renderer: NativeRendererBackendKind;
  viewport: NativeSurfaceViewport | null;
  enableAnimations: boolean;
  enableHistoryViewport: boolean;
  page: number;
  itemSize: number;
  query: string;
  modId: string | null;
  expandedGroups: string[];
  historyItems: string[];
  entries: NativeSurfaceEngineEntry[];
  layoutCommands: NativeSurfaceEngineLayoutCommand[];
  layoutRebuilds: number;
  frameRequests: number;
  lastHit: NativeSurfaceEngineHit;
  selectedItemId: string | null;
  runtimeManifestUrl: string | null;
  runtimePacks: Map<string, ArrayBuffer>;
  runtimeError: string | null;
  browserPack: NativeCompactBrowserPack | null;
  runtimeBrowserIndexByItemId: Map<string, number>;
  groupByKey: Map<string, NativeRuntimeGroup>;
  searchByItemId: Map<string, NativeRuntimeSearchItem>;
  runtimeSearchExactIndex: Map<string, Uint32Array>;
  runtimeSearchSortedKeys: string[];
  runtimeSearchPrefixCache: Map<string, Uint32Array>;
  stringByItemId: Map<string, NativeRuntimeStringItem>;
  textureByItemId: Map<string, NativeRuntimeTextureItem>;
  animationByItemId: Map<string, NativeRuntimeAnimationItem>;
  runtimeProjectionCacheKey: string | null;
  runtimeProjectionIndices: Uint32Array | null;
  runtimeVisibleCacheKey: string | null;
  runtimeVisibleEntries: Uint32Array | null;
  runtimeBrowserWasmPtr: number;
  runtimeBrowserWasmLen: number;
  runtimeBrowserWasmItemCount: number;
  runtimeBrowserWasmProjectedEntries: number;
  currentPageSize: number;
  currentWindowEntries: number;
  lastProjectionMs: number;
  lastProjectionTotalEntries: number;
  lastProjectionQuery: string;
  lastProjectionSource: NativeSurfaceMetricsSurface['lastProjectionSource'];
  runtimeSearchWasmPtr: number;
  runtimeSearchWasmLen: number;
  runtimeGroupWasmPtr: number;
  runtimeGroupWasmLen: number;
  runtimeGroupWasmCount: number;
  runtimeStringWasmPtr: number;
  runtimeStringWasmLen: number;
  runtimeStringWasmItemCount: number;
  runtimeTextureWasmPtr: number;
  runtimeTextureWasmLen: number;
  runtimeTextureWasmItemCount: number;
  runtimeAnimationWasmPtr: number;
  runtimeAnimationWasmLen: number;
  runtimeAnimationWasmItemCount: number;
  hasAnimatedSprites: boolean;
  animatedSpriteCount: number;
  nextFrameDelayMs: number | null;
};

export function createSurfaceState(): SurfaceState {
  return {
    initialized: false,
    renderer: 'compat-canvas',
    viewport: null,
    enableAnimations: false,
    enableHistoryViewport: false,
    page: 1,
    itemSize: 44,
    query: '',
    modId: null,
    expandedGroups: [],
    historyItems: [],
    entries: [],
    layoutCommands: [],
    layoutRebuilds: 0,
    frameRequests: 0,
    lastHit: null,
    selectedItemId: null,
    runtimeManifestUrl: null,
    runtimePacks: new Map(),
    runtimeError: null,
    browserPack: null,
    runtimeBrowserIndexByItemId: new Map(),
    groupByKey: new Map(),
    searchByItemId: new Map(),
    runtimeSearchExactIndex: new Map(),
    runtimeSearchSortedKeys: [],
    runtimeSearchPrefixCache: new Map(),
    stringByItemId: new Map(),
    textureByItemId: new Map(),
    animationByItemId: new Map(),
    runtimeProjectionCacheKey: null,
    runtimeProjectionIndices: null,
    runtimeVisibleCacheKey: null,
    runtimeVisibleEntries: null,
    runtimeBrowserWasmPtr: 0,
    runtimeBrowserWasmLen: 0,
    runtimeBrowserWasmItemCount: 0,
    runtimeBrowserWasmProjectedEntries: 0,
    currentPageSize: 0,
    currentWindowEntries: 0,
    lastProjectionMs: 0,
    lastProjectionTotalEntries: 0,
    lastProjectionQuery: '',
    lastProjectionSource: 'empty',
    runtimeSearchWasmPtr: 0,
    runtimeSearchWasmLen: 0,
    runtimeGroupWasmPtr: 0,
    runtimeGroupWasmLen: 0,
    runtimeGroupWasmCount: 0,
    runtimeStringWasmPtr: 0,
    runtimeStringWasmLen: 0,
    runtimeStringWasmItemCount: 0,
    runtimeTextureWasmPtr: 0,
    runtimeTextureWasmLen: 0,
    runtimeTextureWasmItemCount: 0,
    runtimeAnimationWasmPtr: 0,
    runtimeAnimationWasmLen: 0,
    runtimeAnimationWasmItemCount: 0,
    hasAnimatedSprites: false,
    animatedSpriteCount: 0,
    nextFrameDelayMs: null,
  };
}

