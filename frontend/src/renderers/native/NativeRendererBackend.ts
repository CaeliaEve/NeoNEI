import type { NativeTextureSpriteCommand, NativeRenderCommand, NativeRendererStats } from "./WebGl2NativeRenderer";

export type NativeRendererTextureSource = ImageBitmap;

export interface NativeRendererBackend {
  readonly backend: "webgpu" | "webgl2";
  registerTexture(key: string, bitmap: NativeRendererTextureSource): boolean;
  textureCount(): number;
  render(
    activeWidth: number,
    activeHeight: number,
    commands: NativeRenderCommand[],
    spriteCommands?: NativeTextureSpriteCommand[],
  ): NativeRendererStats;
  dispose(): void;
}
