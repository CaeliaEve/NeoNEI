import axios, { type AxiosRequestConfig } from 'axios';
import { BACKEND_BASE_URL } from '../services/api/core/http';
import { recordRuntimeDiagnostic } from './diagnostics';

const labHttp = axios.create({
  baseURL: `${BACKEND_BASE_URL.replace(/\/+$/g, '')}/lab`,
  timeout: 120000,
});

function isLabDevCompatibilityDisabled(): boolean {
  return import.meta.env.VITE_PUBLIC_RUNTIME_ONLY === '1'
    || import.meta.env.VITE_RUNTIME_DISABLE_DEV_COMPAT === '1';
}

function assertLabDevCompatibilityEnabled(method: string, path: string): void {
  if (!isLabDevCompatibilityDisabled()) {
    return;
  }

  recordRuntimeDiagnostic({
    code: 'LAB_DEV_COMPAT_BLOCKED',
    kind: 'contract-gap',
    message: `Lab compatibility API is disabled for ${method.toUpperCase()} /lab${path}`,
    scope: 'lab-dev-compat',
    route: `/lab${path}`,
    reason: 'public runtime profile must use compiled runtime artifacts',
    strict: true,
    details: { method: method.toUpperCase() },
  });
  throw new Error(`Lab compatibility API is disabled for ${method.toUpperCase()} /lab${path}`);
}

export async function getLabPayload<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  assertLabDevCompatibilityEnabled('get', path);
  const response = await labHttp.get<T>(path, config);
  return response.data;
}

export async function postLabPayload<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabDevCompatibilityEnabled('post', path);
  const response = await labHttp.post<TResponse>(path, body, config);
  return response.data;
}

export async function putLabPayload<TResponse = void, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabDevCompatibilityEnabled('put', path);
  const response = await labHttp.put<TResponse>(path, body, config);
  return response.data;
}

export async function deleteLabPayload<TResponse = void>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertLabDevCompatibilityEnabled('delete', path);
  const response = await labHttp.delete<TResponse>(path, config);
  return response.data;
}
