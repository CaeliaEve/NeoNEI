import type { Request, Response } from 'express';
import {
  createPublishHomeBootstrapDelivery,
  getPublishManifestDelivery,
} from '../services/publish-runtime-delivery.service';
import {
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import type { PublishPublicEndpointKey } from './publish-public-endpoint-registry';

export type PublishPublicEndpointHandler = (req: Request, res: Response) => Promise<void>;

export const PUBLISH_PUBLIC_ENDPOINT_HANDLERS: Readonly<Record<PublishPublicEndpointKey, PublishPublicEndpointHandler>> = Object.freeze({
  manifest: async (req, res) => {
    const delivery = getPublishManifestDelivery();
    setNoStoreHeaders(res);
    if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
      return;
    }
    res.json(delivery.payload);
  },
  'home-bootstrap': async (req, res) => {
    const delivery = createPublishHomeBootstrapDelivery(req.query);
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 120,
      staleWhileRevalidateSeconds: 900,
      staleIfErrorSeconds: 3600,
    });
    if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
      return;
    }
    res.json(await delivery.loadPayload());
  },
});
