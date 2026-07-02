import type { Request, Response } from 'express';
import { getApiV1RuntimeContractIndex } from '../services/runtime-contract-index.service';
import { getApiV1RuntimeManifestDelivery } from '../services/runtime-manifest-delivery.service';
import { getApiV1RuntimeHealthDelivery } from '../services/runtime-observability-delivery.service';
import {
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import { API_V1_ENDPOINTS, type ApiV1EndpointKey } from './v1-endpoint-registry';
import { validateAndFreezeRouteHandlers } from './route-descriptor-registry';

export type ApiV1EndpointHandler = (req: Request, res: Response) => Promise<void>;

export const API_V1_ENDPOINT_HANDLERS: Readonly<Record<ApiV1EndpointKey, ApiV1EndpointHandler>> =
  validateAndFreezeRouteHandlers({
    label: 'api v1 endpoint',
    descriptors: API_V1_ENDPOINTS,
    handlers: {
      health: async (_req, res) => {
        setNoStoreHeaders(res);
        res.json(getApiV1RuntimeHealthDelivery());
      },
      'runtime-manifest': async (req, res) => {
        const delivery = getApiV1RuntimeManifestDelivery();
        setNoStoreHeaders(res);
        if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
          return;
        }
        res.json(delivery.payload);
      },
      'runtime-contracts': async (_req, res) => {
        setPublicCacheHeaders(res, {
          maxAgeSeconds: 300,
          staleWhileRevalidateSeconds: 3600,
        });
        res.json(getApiV1RuntimeContractIndex());
      },
    },
  });
