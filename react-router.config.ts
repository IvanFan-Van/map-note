import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Cloudflare 插件构建输出到 dist (与 vite 默认一致, 否则 SSR 找不到
  // client manifest, 且 wrangler assets 目录须与之匹配)
  buildDirectory: "dist",
} satisfies Config;
