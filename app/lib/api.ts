export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !body?.ok) {
    throw new ApiError(
      body?.error?.message ?? `请求失败 (${res.status})`,
      res.status,
      body?.error?.code ?? "UNKNOWN",
    );
  }
  return body.data as T;
}

export function jsonApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
