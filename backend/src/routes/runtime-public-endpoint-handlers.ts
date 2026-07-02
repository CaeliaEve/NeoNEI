import type { Request, Response } from 'express';
import { getCurrentRuntimeContractIndex } from '../services/runtime-contract-index.service';
import { getCurrentRuntimeManifestDelivery } from '../services/runtime-manifest-delivery.service';
import {
  getCurrentRuntimeDiagnosticsDelivery,
  getCurrentRuntimeHealthDelivery,
} from '../services/runtime-observability-delivery.service';
import {
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import type { RuntimePublicEndpointKey } from './runtime-public-endpoint-registry';

export type RuntimePublicEndpointHandler = (req: Request, res: Response) => Promise<void>;

export const RUNTIME_PUBLIC_ENDPOINT_HANDLERS: Readonly<Record<RuntimePublicEndpointKey, RuntimePublicEndpointHandler>> = Object.freeze({
  health: async (_req, res) => {
    setNoStoreHeaders(res);
    res.json(getCurrentRuntimeHealthDelivery());
  },
  manifest: async (req, res) => {
    const delivery = getCurrentRuntimeManifestDelivery();
    setNoStoreHeaders(res);
    if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
      return;
    }
    res.json(delivery.payload);
  },
  contracts: async (_req, res) => {
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
    });
    res.json(getCurrentRuntimeContractIndex());
  },
  diagnostics: async (_req, res) => {
    setNoStoreHeaders(res);
    res.json(getCurrentRuntimeDiagnosticsDelivery());
  },
});
