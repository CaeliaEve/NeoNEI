import axios, { type AxiosRequestConfig } from 'axios';
import { BACKEND_BASE_URL } from '../services/api/core/http';
import { recordRuntimeDiagnostic } from '../runtime/diagnostics';
import { isControlPlaneDisabled } from '../runtime/runtimeMode';

const ADMIN_TOKEN_HEADER = 'x-neonei-admin-token';
const ADMIN_TOKEN_STORAGE_KEY = 'neonei:admin-token';
const OPS_BASE_URL = `${BACKEND_BASE_URL.replace(/\/+$/g, '')}/ops`;

const adminHttp = axios.create({
  baseURL: OPS_BASE_URL,
  timeout: 120000,
});

function getConfiguredAdminToken(): string {
  return `${import.meta.env.VITE_NEONEI_ADMIN_TOKEN ?? ''}`.trim();
}

function getStoredAdminToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return `${window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? ''}`.trim();
}

function storeAdminToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

function promptForAdminToken(): string {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return '';
  }
  const token = `${window.prompt('Enter NEONEI_ADMIN_TOKEN for NeoNEI control-plane operations') ?? ''}`.trim();
  if (token) {
    storeAdminToken(token);
  }
  return token;
}

function reportControlPlaneBlocked(method: string, path: string, code: string, message: string): never {
  recordRuntimeDiagnostic({
    code,
    kind: 'contract-gap',
    message,
    scope: 'control-plane',
    route: `/ops${path}`,
    reason: 'public runtime profile must use compiled runtime artifacts and explicit current API endpoints',
    strict: true,
    details: { method: method.toUpperCase() },
  });
  throw new Error(message);
}

function assertControlPlaneEnabled(method: string, path: string): void {
  if (!isControlPlaneDisabled()) {
    return;
  }

  reportControlPlaneBlocked(
    method,
    path,
    'CONTROL_PLANE_DISABLED',
    `Control-plane API is disabled for ${method.toUpperCase()} /ops${path}`,
  );
}

function getAdminToken(method: string, path: string): string {
  const token = getStoredAdminToken() || getConfiguredAdminToken() || promptForAdminToken();
  if (token) {
    return token;
  }

  reportControlPlaneBlocked(
    method,
    path,
    'CONTROL_PLANE_ADMIN_TOKEN_MISSING',
    `Admin token is required for ${method.toUpperCase()} /ops${path}`,
  );
}

function withAdminToken(method: string, path: string, config?: AxiosRequestConfig): AxiosRequestConfig {
  const headers = {
    ...(config?.headers ?? {}),
    [ADMIN_TOKEN_HEADER]: getAdminToken(method, path),
  };
  return {
    ...(config ?? {}),
    headers,
  };
}

export async function getControlPayload<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  assertControlPlaneEnabled('get', path);
  const response = await adminHttp.get<T>(path, withAdminToken('get', path, config));
  return response.data;
}

export async function postControlPayload<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertControlPlaneEnabled('post', path);
  const response = await adminHttp.post<TResponse>(path, body, withAdminToken('post', path, config));
  return response.data;
}

export async function putControlPayload<TResponse = void, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertControlPlaneEnabled('put', path);
  const response = await adminHttp.put<TResponse>(path, body, withAdminToken('put', path, config));
  return response.data;
}

export async function deleteControlPayload<TResponse = void>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  assertControlPlaneEnabled('delete', path);
  const response = await adminHttp.delete<TResponse>(path, withAdminToken('delete', path, config));
  return response.data;
}
