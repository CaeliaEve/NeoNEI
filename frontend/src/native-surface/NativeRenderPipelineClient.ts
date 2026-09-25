import type { NativeSurfaceId } from "./contracts";
import type { NativeRenderWorkerClient } from "./NativeRenderWorkerClient.ts";
import {
  connectNativeSurfaceEngineRenderPort,
  disconnectNativeSurfaceEngineRenderPort,
} from "./NativeSurfaceEngineClient.ts";
import { NATIVE_RENDER_PIPELINE_PROTOCOL } from "./NativeRenderPipelineProtocol.ts";

export const NATIVE_RENDER_PIPELINE_CLIENT_POLICY = Object.freeze({
  schema: NATIVE_RENDER_PIPELINE_PROTOCOL.schema,
  owner: "native-surface-main-thread-control-plane",
  topology: NATIVE_RENDER_PIPELINE_PROTOCOL.topology,
  transferPolicy: NATIVE_RENDER_PIPELINE_PROTOCOL.ownershipPolicy,
  mainThreadFramePolicy: NATIVE_RENDER_PIPELINE_PROTOCOL.mainThreadFramePolicy,
  failurePolicy: "fail-closed-reset-surface-render-worker",
  lifecyclePolicy: "per-surface-connect-disconnect-recreate-explicit",
} as const);

type NativeRenderPipelineState = "disconnected" | "connecting" | "connected" | "disconnecting" | "faulted";

export type NativeRenderPipelineClient = Readonly<{
  surfaceId: NativeSurfaceId;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  recreate: () => Promise<void>;
  isConnected: () => boolean;
  getSessionId: () => string | null;
}>;

let sessionSequence = 0;

function nextSessionId(surfaceId: NativeSurfaceId): string {
  sessionSequence += 1;
  return `native-render-pipeline-${surfaceId}-${sessionSequence}`;
}

export function createNativeRenderPipelineClient(
  surfaceId: NativeSurfaceId,
  renderClient: NativeRenderWorkerClient,
): NativeRenderPipelineClient {
  if (renderClient.surfaceId !== surfaceId) {
    throw new Error(`Native render pipeline surface mismatch: ${surfaceId} != ${renderClient.surfaceId}`);
  }
  let state: NativeRenderPipelineState = "disconnected";
  let activeSessionId: string | null = null;
  let transition: Promise<void> | null = null;

  const isConnected = (): boolean => state === "connected" && activeSessionId !== null;

  const enterFaultedState = async (sessionId: string | null): Promise<void> => {
    if (sessionId) {
      await disconnectNativeSurfaceEngineRenderPort(surfaceId, sessionId).catch(() => undefined);
    }
    renderClient.reset();
    state = "faulted";
    activeSessionId = null;
    transition = null;
  };

  const connect = (): Promise<void> => {
    if (isConnected()) return Promise.resolve();
    if (transition) return transition;
    if (typeof MessageChannel === "undefined") {
      renderClient.reset();
      state = "faulted";
      return Promise.reject(new Error("Native render pipeline requires MessageChannel"));
    }

    state = "connecting";
    const sessionId = nextSessionId(surfaceId);
    const channel = new MessageChannel();
    transition = (async () => {
      try {
        await renderClient.connectEnginePort(sessionId, channel.port2);
        await connectNativeSurfaceEngineRenderPort(surfaceId, sessionId, channel.port1);
        activeSessionId = sessionId;
        state = "connected";
      } catch (error) {
        channel.port1.close();
        channel.port2.close();
        await enterFaultedState(sessionId);
        throw error;
      } finally {
        transition = null;
      }
    })();
    return transition;
  };

  const disconnect = (): Promise<void> => {
    if (state === "disconnected" && !activeSessionId) return Promise.resolve();
    if (transition) return transition.then(() => disconnect());
    const sessionId = activeSessionId;
    if (!sessionId) {
      renderClient.reset();
      state = "faulted";
      return Promise.reject(new Error(`Native render pipeline lost its session: ${surfaceId}`));
    }

    state = "disconnecting";
    transition = (async () => {
      const results = await Promise.allSettled([
        disconnectNativeSurfaceEngineRenderPort(surfaceId, sessionId),
        renderClient.disconnectEnginePort(sessionId),
      ]);
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) {
        await enterFaultedState(sessionId);
        throw failure.reason;
      }
      activeSessionId = null;
      state = "disconnected";
    })().finally(() => {
      transition = null;
    });
    return transition;
  };

  const recreate = async (): Promise<void> => {
    if (state === "faulted") {
      renderClient.reset();
      activeSessionId = null;
      transition = null;
      state = "disconnected";
    } else if (state !== "disconnected") {
      await disconnect();
    }
    await connect();
  };

  return Object.freeze({
    surfaceId,
    connect,
    disconnect,
    recreate,
    isConnected,
    getSessionId: () => activeSessionId,
  });
}
