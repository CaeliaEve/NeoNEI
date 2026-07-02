import axios, { type AxiosRequestConfig } from 'axios';
import { BACKEND_BASE_URL } from '../services/api/core/http';
import { recordRuntimeDiagnostic } from '../runtime/diagnostics';
import { isLabControlDisabled } from '../runtime/runtimeMode';

const labHttp = axios.create({
  baseURL: `${BACKEND_BASE_URL.replace(/\/+$/g, '')}/lab`,
  timeout: 120000,
});

function assertLabControlEnabled(method: string, path: string): void {
  if (!isLabControlDisabled()) {
    return;
  }

  recordRuntimeDiagnostic({
    code: 'LAB_CONTROL_DISABLED',
    kind: 'contract-gap',
    message: `Lab control API is disabled for ${method.toUpperCase()} /lab${path}`,
    scope: 'lab-control',
    route: `/lab${path}`,
    reason: 'public runtime profile must use compiled runtime artifacts and explicit current API endpoints',
    strict: true,
    details: { method: method.toUpperCase() },
  });
  throw new Error(`Lab control API is disabled for ${method.toUpperCase()} /lab${path}`);
}

export async function getLabControlPayload<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  assertLabControlEnabled('get', path);
  const response = await labHttp.get<T>(path, config);
  return response.data;
}

export async function postLabControlPayload<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabControlEnabled('post', path);
  const response = await labHttp.post<TResponse>(path, body, config);
  return response.data;
}

export async function putLabControlPayload<TResponse = void, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabControlEnabled('put', path);
  const response = await labHttp.put<TResponse>(path, body, config);
  return response.data;
}

export async function deleteLabControlPayload<TResponse = void>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabControlEnabled('delete', path);
  const response = await labHttp.delete<TResponse>(path, config);
  return response.data;
}
