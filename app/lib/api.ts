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

/** 从任意 catch 值中提取可展示的错误信息 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallback: (status: number) => string,
): Promise<T> {
  const headers: Record<string, string> =
    typeof init?.body === "string" ? { "Content-Type": "application/json" } : {};
  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !body?.ok) {
    throw new ApiError(
      body?.error?.message ?? fallback(res.status),
      res.status,
      body?.error?.code ?? "UNKNOWN",
    );
  }
  return body.data as T;
}

export function api<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init, (status) => `请求失败 (${status})`);
}

export function jsonApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** multipart 表单上传 (浏览器自动设置 Content-Type 边界) */
export function postForm<T>(path: string, form: FormData, fallbackMessage = "上传失败"): Promise<T> {
  return request<T>(path, { method: "POST", body: form }, () => fallbackMessage);
}

/** 服务端错误响应构造 (统一 { ok:false, error:{ code, message } } 与 Content-Type) */
export function apiError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
