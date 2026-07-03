import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeTextureSpriteCommand } from "../renderers/native/WebGl2NativeRenderer.ts";
import {
  NativeUiAtlasResourceError,
  registerNativeUiAtlasSources,
  resolveNativeUiAtlasSpriteSource,
  type NativeUiAtlasRegistrationOptions,
  type NativeUiAtlasRegistrationResult,
  type NativeUiPreparedAtlasSource,
} from "./nativeUiAtlasResourceRegistry.ts";
import {
  prepareNativeUiBackgroundSource,
  type NativeUiBackgroundPrepareOptions,
  type NativeUiBackgroundPrepareResult,
} from "./nativeUiBackgroundResourceLoader.ts";
import {
  buildNativeUiSpriteCommands,
  type NativeUiAtlasSpriteSource,
  type NativeUiPreparedBackgroundSource,
} from "./nativeUiRenderCommandBuilder.ts";
import {
  configureNativeUiCanvasSize,
  NativeUiRendererSession,
  type NativeUiRendererCanvas,
  type NativeUiRendererProbe,
} from "./nativeUiRendererSession.ts";
import type {
  NativeUiDynamicPrimitive,
  NativeUiLayoutSurface,
  NativeUiSlotCell,
} from "./nativeUiRuntimeRegistry.ts";
import {
  nativeUiSlotTextureKey,
  NativeUiTextureRegistry,
} from "./nativeUiTextureRegistry.ts";

export interface NativeUiCanvasRenderPipelineState {
  currentDpr: number;
  renderError: string | null;
  renderReady: boolean;
  missingTextureCount: number;
  backgroundSource: NativeUiPreparedBackgroundSource | null;
  backgroundLoadError: string | null;
}

export interface NativeUiCanvasRenderPipelineSnapshot<TEntry extends { atlasLookupId?: string | null }> {
  mounted: boolean;
  canvas: NativeUiRendererCanvas | null;
  displayWidth: number;
  displayHeight: number;
  devicePixelRatio: unknown;
  layout: NativeUiLayoutSurface | null;
  manifestUrl: string | null;
  layoutWidth: number;
  layoutHeight: number;
  dynamicPrimitives: readonly NativeUiDynamicPrimitive[];
  slotCells: readonly NativeUiSlotCell<TEntry>[];
}

export interface NativeUiCanvasRenderPipelineDeps<TEntry extends { atlasLookupId?: string | null }> {
  nextTick?: () => Promise<unknown>;
  rendererProbe?: NativeUiRendererProbe;
  prepareBackground?: (options: NativeUiBackgroundPrepareOptions) => Promise<NativeUiBackgroundPrepareResult>;
  registerAtlasSources?: (options: NativeUiAtlasRegistrationOptions<TEntry>) => Promise<NativeUiAtlasRegistrationResult>;
  onStateChange?: (state: NativeUiCanvasRenderPipelineState) => void;
}

function initialNativeUiCanvasRenderState(): NativeUiCanvasRenderPipelineState {
  return {
    currentDpr: 1,
    renderError: null,
    renderReady: false,
    missingTextureCount: 0,
    backgroundSource: null,
    backgroundLoadError: null,
  };
}

function cloneNativeUiCanvasRenderState(
  state: NativeUiCanvasRenderPipelineState,
): NativeUiCanvasRenderPipelineState {
  return { ...state };
}

function nativeUiRenderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nativeUiRenderMissingTextureCount(error: unknown): number {
  return error instanceof NativeUiAtlasResourceError ? error.missingCount : 0;
}

export class NativeUiCanvasRenderPipeline<TEntry extends { atlasLookupId?: string | null }> {
  private readonly rendererSession: NativeUiRendererSession;
  private readonly textureRegistry: NativeUiTextureRegistry;
  private readonly preparedSources = new Map<string, NativeUiPreparedAtlasSource>();
  private readonly deps: NativeUiCanvasRenderPipelineDeps<TEntry>;
  private state = initialNativeUiCanvasRenderState();
  private loadSequence = 0;
  private hasAnimatedSprites = false;

  constructor(deps: NativeUiCanvasRenderPipelineDeps<TEntry> = {}) {
    this.deps = deps;
    this.rendererSession = new NativeUiRendererSession();
    this.textureRegistry = new NativeUiTextureRegistry();
    this.publishState();
  }

  get currentState(): NativeUiCanvasRenderPipelineState {
    return cloneNativeUiCanvasRenderState(this.state);
  }

  get activeRenderer(): NativeRendererBackend | null {
    return this.rendererSession.activeRenderer;
  }

  get preparedAtlasSources(): ReadonlyMap<string, NativeUiPreparedAtlasSource> {
    return this.preparedSources;
  }

  slotTextureKey(cell: NativeUiSlotCell<TEntry>): string {
    return nativeUiSlotTextureKey(cell.role, this.state.currentDpr, cell.width, cell.height);
  }

  resolveAtlasSource(entry: TEntry, nowMs: number): NativeUiAtlasSpriteSource | null {
    return resolveNativeUiAtlasSpriteSource(this.preparedSources, entry, nowMs);
  }

  buildSpriteCommands(
    snapshot: NativeUiCanvasRenderPipelineSnapshot<TEntry>,
    nowMs: number,
  ): NativeTextureSpriteCommand[] {
    return buildNativeUiSpriteCommands({
      dpr: this.state.currentDpr,
      nowMs,
      background: this.state.backgroundSource,
      dynamicPrimitives: snapshot.dynamicPrimitives,
      slotCells: snapshot.slotCells,
      slotTextureKey: (cell) => this.slotTextureKey(cell),
      resolveAtlasSource: (entry, timestamp) => this.resolveAtlasSource(entry, timestamp),
    });
  }

  renderFrame(snapshot: NativeUiCanvasRenderPipelineSnapshot<TEntry>, nowMs?: number): boolean {
    return this.rendererSession.renderFrame({
      canvas: snapshot.canvas,
      nowMs,
      spriteCommands: (timestamp) => this.buildSpriteCommands(snapshot, timestamp),
    });
  }

  async rebuild(snapshot: NativeUiCanvasRenderPipelineSnapshot<TEntry>): Promise<NativeUiCanvasRenderPipelineState> {
    if (!snapshot.mounted) return this.currentState;
    const sequence = this.beginRebuild();
    await this.waitForDomFlush();
    if (!this.isCurrent(sequence)) return this.currentState;

    const canvas = snapshot.canvas;
    if (!canvas) return this.currentState;
    const sizing = configureNativeUiCanvasSize(
      canvas,
      snapshot.displayWidth,
      snapshot.displayHeight,
      snapshot.devicePixelRatio,
    );
    this.commitState({ currentDpr: sizing.dpr });

    let renderer: NativeRendererBackend;
    try {
      renderer = this.rendererSession.ensureRenderer(canvas, this.deps.rendererProbe);
    } catch (error) {
      this.commitState({ renderError: nativeUiRenderErrorMessage(error) });
      return this.currentState;
    }
    this.commitState({ renderError: null });

    let backgroundResult: NativeUiBackgroundPrepareResult;
    let atlasResult: NativeUiAtlasRegistrationResult;
    try {
      this.textureRegistry.registerSlotTextures(renderer, this.state.currentDpr, snapshot.slotCells);
      this.textureRegistry.registerDynamicPrimitiveTextures(renderer, snapshot.dynamicPrimitives);
      const backgroundReady = this.prepareBackground(renderer, snapshot, sequence);
      const atlasReady = this.registerAtlasSources(renderer, snapshot);
      [backgroundResult, atlasResult] = await Promise.all([backgroundReady, atlasReady]);
    } catch (error) {
      if (!this.isCurrent(sequence)) return this.currentState;
      this.preparedSources.clear();
      this.hasAnimatedSprites = false;
      this.commitState({
        renderError: nativeUiRenderErrorMessage(error),
        renderReady: false,
        missingTextureCount: nativeUiRenderMissingTextureCount(error),
        backgroundSource: null,
        backgroundLoadError: null,
      });
      return this.currentState;
    }
    if (!this.isCurrent(sequence)) return this.currentState;
    if (backgroundResult.aborted) return this.currentState;
    if (backgroundResult.error) {
      this.preparedSources.clear();
      this.hasAnimatedSprites = false;
      this.commitState({
        renderError: backgroundResult.error,
        renderReady: false,
        missingTextureCount: atlasResult.missingCount,
        backgroundSource: null,
        backgroundLoadError: backgroundResult.error,
      });
      return this.currentState;
    }

    this.preparedSources.clear();
    atlasResult.preparedSources.forEach((source, lookupId) => {
      this.preparedSources.set(lookupId, source);
    });
    this.hasAnimatedSprites = atlasResult.hasAnimatedSprites;
    this.commitState({
      backgroundSource: backgroundResult.source,
      backgroundLoadError: backgroundResult.error,
      missingTextureCount: atlasResult.missingCount,
      renderReady: true,
    });
    this.renderFrame(snapshot);
    this.rendererSession.scheduleAnimationLoop({
      enabled: this.hasAnimatedSprites,
      renderAt: (timestamp) => this.renderFrame(snapshot, timestamp),
    });
    return this.currentState;
  }

  invalidate(): void {
    this.loadSequence += 1;
    this.rendererSession.stopAnimationLoop();
  }

  dispose(): void {
    this.invalidate();
    this.rendererSession.dispose();
    this.textureRegistry.clear();
    this.preparedSources.clear();
    this.hasAnimatedSprites = false;
    this.commitState(initialNativeUiCanvasRenderState());
  }

  private beginRebuild(): number {
    const sequence = this.loadSequence + 1;
    this.loadSequence = sequence;
    this.rendererSession.stopAnimationLoop();
    this.preparedSources.clear();
    this.hasAnimatedSprites = false;
    this.commitState({
      renderReady: false,
      missingTextureCount: 0,
      backgroundSource: null,
      backgroundLoadError: null,
    });
    return sequence;
  }

  private waitForDomFlush(): Promise<unknown> {
    return this.deps.nextTick?.() ?? Promise.resolve();
  }

  private isCurrent(sequence: number): boolean {
    return sequence === this.loadSequence;
  }

  private prepareBackground(
    renderer: NativeRendererBackend,
    snapshot: NativeUiCanvasRenderPipelineSnapshot<TEntry>,
    sequence: number,
  ): Promise<NativeUiBackgroundPrepareResult> {
    const prepareBackground = this.deps.prepareBackground ?? prepareNativeUiBackgroundSource;
    return prepareBackground({
      renderer,
      textureRegistry: this.textureRegistry,
      layout: snapshot.layout,
      manifestUrl: snapshot.manifestUrl,
      layoutWidth: snapshot.layoutWidth,
      layoutHeight: snapshot.layoutHeight,
      dpr: this.state.currentDpr,
      isActive: () => this.isCurrent(sequence),
    });
  }

  private registerAtlasSources(
    renderer: NativeRendererBackend,
    snapshot: NativeUiCanvasRenderPipelineSnapshot<TEntry>,
  ): Promise<NativeUiAtlasRegistrationResult> {
    const registerAtlasSources = this.deps.registerAtlasSources ?? registerNativeUiAtlasSources;
    return registerAtlasSources({
      renderer,
      textureRegistry: this.textureRegistry,
      slotCells: snapshot.slotCells,
    });
  }

  private commitState(patch: Partial<NativeUiCanvasRenderPipelineState> | NativeUiCanvasRenderPipelineState): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.publishState();
  }

  private publishState(): void {
    this.deps.onStateChange?.(this.currentState);
  }
}
