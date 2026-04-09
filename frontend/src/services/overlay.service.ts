export interface OverlayPayload {
  type: 'recipe_overlay';
  requestId: string;
  schemaVersion: 'v1';
  recipeId: string;
  recipeType: string;
  inputs: unknown[];
  outputs: unknown[];
  fluidInputs: unknown[];
  fluidOutputs: unknown[];
  machineName: string;
  timestamp: number;
}

interface GameIPC {
  send: (channel: string, payload: OverlayPayload) => void;
}

declare global {
  interface Window {
    __gameIPC__?: GameIPC;
  }
}

const ACK_TIMEOUT_MS = 500;

export async function sendOverlayPayload(payload: OverlayPayload): Promise<{ ok: boolean; ackMs?: number; error?: string }> {
  const start = performance.now();

  if (!payload.recipeId || !payload.recipeType || payload.type !== 'recipe_overlay' || !payload.requestId || payload.schemaVersion !== 'v1') {
    return { ok: false, error: 'invalid-payload' };
  }

  if (!window.__gameIPC__ || typeof window.__gameIPC__.send !== 'function') {
    return { ok: false, error: 'ipc-unavailable' };
  }

  try {
    window.__gameIPC__.send('overlay', payload);

    // P0: local ack observability (send path ACK). Game side ACK can be added later.
    const ackMs = Math.round(performance.now() - start);
    if (ackMs > ACK_TIMEOUT_MS) {
      console.warn(`[overlay] ack timeout warning: ${ackMs}ms`);
    }

    return { ok: true, ackMs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'ipc-send-failed' };
  }
}
