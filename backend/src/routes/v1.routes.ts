import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import {
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import { getApiV1RuntimeContractIndex } from '../services/runtime-contract-index.service';
import { getApiV1RuntimeManifestDelivery } from '../services/runtime-manifest-delivery.service';
import { getApiV1RuntimeHealthDelivery } from '../services/runtime-observability-delivery.service';

const router = Router();

router.get('/health', (_req, res) => {
  setNoStoreHeaders(res);
  res.json(getApiV1RuntimeHealthDelivery());
});

router.get(
  '/runtime/manifest',
  asyncHandler(async (req, res) => {
    const delivery = getApiV1RuntimeManifestDelivery();
    setNoStoreHeaders(res);
    if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
      return;
    }
    res.json(delivery.payload);
  }),
);

router.get('/runtime/contracts', (_req, res) => {
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 3600,
  });
  res.json(getApiV1RuntimeContractIndex());
});

export default router;
