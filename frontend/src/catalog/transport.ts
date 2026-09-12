import { limits } from '@neonei/catalog/source';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status;
  }
}

/** Bound the stream before allocating a complete response, including texture downloads. */
export async function body(response: Response, limit: number, expected?: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('empty_response', '接口没有返回数据');
  const target = expected === undefined ? null : new Uint8Array(expected);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit || (target && size + value.byteLength > target.length)) {
        await reader.cancel();
        throw new ApiError('response_limit', '响应超过允许的大小');
      }
      if (target) target.set(value, size); else chunks.push(value);
      size += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  if (target) {
    if (size !== target.length) throw new ApiError('invalid_file', '文件长度与清单不一致');
    return target;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function request(url: string, signal?: AbortSignal, limit: number = limits.result): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  const bytes = await body(response, limit);
  let data: unknown;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError('invalid_response', '接口没有返回有效的 JSON 数据', response.status);
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
    if (!error || typeof error !== 'object') throw new ApiError('request_failed', '请求失败', response.status);
    throw new ApiError('code' in error && typeof error.code === 'string' ? error.code : 'request_failed',
      'message' in error && typeof error.message === 'string' ? error.message : '请求失败', response.status);
  }
  return data;
}

export function networkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'NetworkError');
}
