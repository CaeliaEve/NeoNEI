import { Router } from 'express';
import {
  CURRENT_RUNTIME_ENDPOINTS,
  mountCurrentRuntimeEndpoint,
} from './current-runtime-endpoint-registry';
import { getCurrentRuntimeEndpointHandler } from './current-runtime-endpoint-handlers';

const router = Router();

for (const endpoint of CURRENT_RUNTIME_ENDPOINTS) {
  mountCurrentRuntimeEndpoint(router, endpoint.key, getCurrentRuntimeEndpointHandler(endpoint.key));
}

export default router;
