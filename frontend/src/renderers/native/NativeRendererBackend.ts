import type {
  NativeLayoutCommandBatch,
  NativeRendererStats,
  NativeTextureSpriteCommand,
} from "./NativeRendererCommandProtocol.ts";

export type NativeRendererTextureSource = TexImageSource;

export type NativeRendererDiagnostics = {
  contextLost: boolean;
  contextLostReason: string | null;
};

export interface NativeRendererBackend {
  readonly backend: "webgpu" | "webgl2";
  registerTexture(key: string, bitmap: NativeRendererTextureSource): boolean;
  textureCount(): number;
  diagnostics?(): NativeRendererDiagnostics;
  render(
    activeWidth: number,
    activeHeight: number,
    commands: NativeLayoutCommandBatch,
    spriteCommands?: NativeTextureSpriteCommand[],
  ): NativeRendererStats;
  dispose(): void;
}
