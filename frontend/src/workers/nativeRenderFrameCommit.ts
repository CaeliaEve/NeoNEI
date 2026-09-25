import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type {
  NativeLayoutCommandBatch,
  NativeRendererStats,
  NativeTextureSpriteCommand,
} from "../renderers/native/NativeRendererCommandProtocol.ts";

export type NativeRenderFrameCommitResult =
  | Readonly<{
    status: "deferred";
    missingTextureKeys: string[];
  }>
  | Readonly<{
    status: "rendered";
    missingTextureKeys: [];
    stats: NativeRendererStats;
  }>;

export function findMissingNativeRenderTextureKeys(
  spriteCommands: NativeTextureSpriteCommand[],
  residentTextureKeys: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(
    spriteCommands
      .map((command) => command.textureKey)
      .filter((textureKey) => textureKey && !residentTextureKeys.has(textureKey)),
  ));
}

export function commitNativeRenderFrame(
  renderer: NativeRendererBackend,
  width: number,
  height: number,
  commands: NativeLayoutCommandBatch,
  spriteCommands: NativeTextureSpriteCommand[],
  residentTextureKeys: ReadonlySet<string>,
  prepareSpriteCommands: (commands: NativeTextureSpriteCommand[]) => NativeTextureSpriteCommand[] = (commands) => commands,
): NativeRenderFrameCommitResult {
  const missingTextureKeys = findMissingNativeRenderTextureKeys(spriteCommands, residentTextureKeys);
  if (missingTextureKeys.length > 0) {
    return { status: "deferred", missingTextureKeys };
  }
  return {
    status: "rendered",
    missingTextureKeys: [],
    stats: renderer.render(width, height, commands, prepareSpriteCommands(spriteCommands)),
  };
}
