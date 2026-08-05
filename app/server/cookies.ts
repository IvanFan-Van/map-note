/** 会话/OAuth Cookie 共享配置 (统一 secure 标志, 生产环境应改为 true) */
export const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: false,
};
