import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import {
  sendNotModifiedIfEtagMatches,
  setNoStoreHeaders,
  setPublicCacheHeaders,
} from '../utils/http-cache';
import { getCurrentRuntimeContractIndex } from '../services/runtime-contract-index.service';
import { getCurrentRuntimeManifestDelivery } from '../services/runtime-manifest-delivery.service';
import {
  getCurrentRuntimeDiagnosticsDelivery,
  getCurrentRuntimeHealthDelivery,
} from '../services/runtime-observability-delivery.service';

const router = Router();

router.get('/health', (_req, res) => {
  setNoStoreHeaders(res);
  res.json(getCurrentRuntimeHealthDelivery());
});

router.get('/manifest',
  asyncHandler(async (req, res) => {
    const delivery = getCurrentRuntimeManifestDelivery();
    setNoStoreHeaders(res);
    if (sendNotModifiedIfEtagMatches(req, res, delivery.etag)) {
      return;
    }
    res.json(delivery.payload);
  }),
);

router.get('/contracts', (_req, res) => {
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 3600,
  });
  res.json(getCurrentRuntimeContractIndex());
});
router.get('/diagnostics',
  asyncHandler(async (_req, res) => {
    setNoStoreHeaders(res);
    res.json(getCurrentRuntimeDiagnosticsDelivery());
  }),
);

export default router;
