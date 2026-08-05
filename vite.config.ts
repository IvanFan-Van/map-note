import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  environments: {
    ssr: {
      // 必须显式指向 react-router 期望的 server 目录: 插件默认 (dist/ssr)
      // 会使 react-router build 的 writeBundle 钩子读不到
      // dist/server/.vite/manifest.json 而失败 (v7 与 cloudflare 插件的集成缺口)
      build: { outDir: "dist/server" },
      // 此清单来自 cloudflare 插件 SSR 依赖预打包坑: 缺失会报
      // "There is a new version of the pre-bundle" 或运行时解析失败
      // (含 @noble/hashes 子路径, 见 docs/CHANGELOG)
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react-dom/server",
          "react/jsx-dev-runtime",
          "react-router",
          "isbot",
          "pusher",
          "pusher-js",
          "zustand",
          "@noble/hashes/hmac.js",
          "@noble/hashes/legacy.js",
          "@noble/hashes/sha2.js",
          "@noble/hashes/utils.js",
        ],
      },
    },
  },
});
