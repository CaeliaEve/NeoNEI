import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { asyncHandler } from '../utils/http';
import { setNoStoreHeaders } from '../utils/http-cache';
import {
  PATTERN_CONTROL_ENDPOINTS,
  type PatternControlEndpoint,
} from './pattern-control-endpoint-registry';
import { PATTERN_CONTROL_ENDPOINT_HANDLERS } from './pattern-control-endpoint-handlers';

const router = Router();

function addControlHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    setNoStoreHeaders(res);
  }
  next();
}

function registerPatternControlEndpoint(target: Router, endpoint: PatternControlEndpoint): void {
  const handler: RequestHandler = asyncHandler(PATTERN_CONTROL_ENDPOINT_HANDLERS[endpoint.key]);
  switch (endpoint.method) {
    case 'get':
      target.get(endpoint.path, handler);
      break;
    case 'post':
      target.post(endpoint.path, handler);
      break;
    case 'put':
      target.put(endpoint.path, handler);
      break;
    case 'delete':
      target.delete(endpoint.path, handler);
      break;
  }
}

router.use(addControlHeaders);

for (const endpoint of PATTERN_CONTROL_ENDPOINTS) {
  registerPatternControlEndpoint(router, endpoint);
}

export default router;
