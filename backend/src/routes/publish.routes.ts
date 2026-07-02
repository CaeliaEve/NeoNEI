import { Router, type Router as ExpressRouter } from 'express';
import { asyncHandler } from '../utils/http';
import { sendNotModifiedIfEtagMatches, setNoStoreHeaders, setPublicCacheHeaders } from '../utils/http-cache';
import {
  createPublishHomeBootstrapDelivery,
  getPublishManifestDelivery,
} from '../services/publish-runtime-delivery.service';

function registerPublicReadRoutes(router: ExpressRouter): void {
  router.get(
    '/manifest',
    asyncHandler(async (req, res) => {
      const delivery = getPublishManifestDelivery();
      setNoStoreHeaders(res);
      if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
        return;
      }
      res.json(delivery.payload);
    }),
  );

  router.get(
    '/home-bootstrap',
    asyncHandler(async (req, res) => {
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
    }),
  );
}

export function createPublishRoutes(): ExpressRouter {
  const router = Router();
  registerPublicReadRoutes(router);
  return router;
}

export const publicPublishRoutes = createPublishRoutes();

export default publicPublishRoutes;
