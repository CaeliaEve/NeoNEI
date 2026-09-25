import type { NativeSurfaceId } from "../native-surface/contracts";
import {
  getNativeRenderPipelineTransferables,
  isNativeRenderPipelineMessage,
  type NativeRenderPipelineFrameRequest,
  type NativeRenderPipelineFrameRendered,
  type NativeRenderPipelineMessage,
} from "../native-surface/NativeRenderPipelineProtocol.ts";

type PendingFrame = {
  resolve: (result: NativeRenderPipelineFrameRendered) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class NativeSurfaceRenderConnection {
  readonly surfaceId: NativeSurfaceId;
  readonly sessionId: string;
  private readonly port: MessagePort;
  private readonly pendingFrames = new Map<number, PendingFrame>();
  private ready = false;
  private closed = false;
  private handshakeResolve: (() => void) | null = null;
  private handshakeReject: ((error: Error) => void) | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(surfaceId: NativeSurfaceId, sessionId: string, port: MessagePort) {
    this.surfaceId = surfaceId;
    this.sessionId = sessionId;
    this.port = port;
  }

  isReady(): boolean {
    return this.ready && !this.closed;
  }

  async connect(timeoutMs = 3000): Promise<void> {
    if (this.closed) throw new Error(`Native render connection is closed: ${this.surfaceId}`);
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!isNativeRenderPipelineMessage(event.data)) {
        this.close("Native render pipeline received a malformed response");
        return;
      }
      this.handleMessage(event.data);
    };
    this.port.onmessageerror = () => this.close("Native render pipeline message decode failed");
    this.port.start();
    const ready = new Promise<void>((resolve, reject) => {
      this.handshakeResolve = resolve;
      this.handshakeReject = reject;
      this.handshakeTimer = setTimeout(() => {
        this.close("Native render pipeline handshake timed out");
      }, timeoutMs);
    });
    try {
      this.port.postMessage({ type: "pipelineHandshake", sessionId: this.sessionId } satisfies NativeRenderPipelineMessage);
    } catch (error) {
      this.close(error instanceof Error ? error.message : String(error));
    }
    await ready;
  }

  async render(
    request: NativeRenderPipelineFrameRequest,
    timeoutMs = 5000,
  ): Promise<NativeRenderPipelineFrameRendered> {
    if (!this.isReady() || request.sessionId !== this.sessionId) {
      throw new Error(`Native render pipeline is not connected: ${this.surfaceId}`);
    }
    const rendered = new Promise<NativeRenderPipelineFrameRendered>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close(`Native render frame ${request.frameToken} timed out`);
      }, timeoutMs);
      this.pendingFrames.set(request.frameToken, { resolve, reject, timer });
    });
    try {
      this.port.postMessage(request, getNativeRenderPipelineTransferables(request));
    } catch (error) {
      this.close(error instanceof Error ? error.message : String(error));
      throw error;
    }
    return await rendered;
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    const error = new Error(reason);
    this.handshakeReject?.(error);
    this.handshakeResolve = null;
    this.handshakeReject = null;
    for (const pending of this.pendingFrames.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingFrames.clear();
    this.port.close();
  }

  private handleMessage(message: NativeRenderPipelineMessage): void {
    if (message.sessionId !== this.sessionId) {
      this.close("Native render pipeline session mismatch");
      return;
    }
    if (message.type === "pipelineReady") {
      this.ready = true;
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
      this.handshakeResolve?.();
      this.handshakeResolve = null;
      this.handshakeReject = null;
      return;
    }
    if (message.type === "frameRendered") {
      const pending = this.pendingFrames.get(message.frameToken);
      if (!pending) return;
      this.pendingFrames.delete(message.frameToken);
      clearTimeout(pending.timer);
      pending.resolve(message);
      return;
    }
    if (message.type === "pipelineError") {
      this.close(`${message.code}: ${message.message}`);
    }
  }
}
