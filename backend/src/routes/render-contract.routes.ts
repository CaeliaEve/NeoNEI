import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../utils/http';
import {
  RENDER_CONTRACT_ENDPOINTS,
  type RenderContractEndpoint,
} from './render-contract-endpoint-registry';
import { RENDER_CONTRACT_ENDPOINT_HANDLERS } from './render-contract-endpoint-handlers';

const router = Router();

function registerRenderContractEndpoint(target: Router, endpoint: RenderContractEndpoint): void {
  const handler: RequestHandler = asyncHandler(RENDER_CONTRACT_ENDPOINT_HANDLERS[endpoint.key]);
  switch (endpoint.method) {
    case 'get':
      target.get(endpoint.path, handler);
      break;
    case 'post':
      target.post(endpoint.path, handler);
      break;
  }
}

for (const endpoint of RENDER_CONTRACT_ENDPOINTS) {
  registerRenderContractEndpoint(router, endpoint);
}

export default router;
