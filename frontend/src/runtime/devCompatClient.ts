import axios, { type AxiosRequestConfig } from 'axios';
import { BACKEND_BASE_URL } from '../services/api/core/http';

const labHttp = axios.create({
  baseURL: `${BACKEND_BASE_URL.replace(/\/+$/g, '')}/lab`,
  timeout: 120000,
});

export async function getLabPayload<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await labHttp.get<T>(path, config);
  return response.data;
}

export async function postLabPayload<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await labHttp.post<TResponse>(path, body, config);
  return response.data;
}

export async function putLabPayload<TResponse = void, TBody = unknown>(
  path: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await labHttp.put<TResponse>(path, body, config);
  return response.data;
}

export async function deleteLabPayload<TResponse = void>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await labHttp.delete<TResponse>(path, config);
  return response.data;
}
