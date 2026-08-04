# 修改记录 (Changelog)

> 每次提交记录修改的文件、改动内容与最终结果。与 git 提交一一对应。

## 2026-08-04 — 初始规格文档 (specification)

- **修改文件:**
  - `docs/specifications.md` (新建): 项目完整规格说明书 v1.1
  - `assets/LeMiXiaoNaiPaoTi.TTF`: 中文字体文件 (已存在, 首次纳入版本控制)
- **改动:**
  - 编写完整规格: 技术栈、架构 (Cloudflare Workers + D1 + R2 + Pusher)、D1 数据模型、全部 API 接口定义、9 大功能规格与实现计划、路由、字体与视觉规范、部署配置、里程碑、ADR
  - 关键决策: 实时同步采用 Pusher 免费版 (移除 Durable Object 依赖); 身份认证采用 Google OAuth (Authorization Code + PKCE)
- **最终结果:** 规格文档完成, 成为后续开发的单一事实来源。

## 2026-08-04 — M1 脚手架: Cloudflare 集成 + Google OAuth + 背景板基础

- **修改文件:**
  - `package.json` / `pnpm-lock.yaml`: 新增依赖 (pusher/pusher-js/react-markdown/remark-gfm/zustand/clsx/lucide-react; dev: wrangler/@cloudflare/vite-plugin/@cloudflare/workers-types/vite-tsconfig-paths); **React Router v8 → v7.9.6** (vite 7, @cloudflare/vite-plugin 1.15.3, @react-router/dev 7.9.6); 新增 scripts (deploy/db:migrate)
  - `vite.config.ts`: 接入 cloudflare 插件 (`viteEnvironment: { name: "ssr" }`, 置于首位) + SSR 环境依赖预打包列表
  - `wrangler.jsonc` (新建): D1 `co-note` (database_id 已填入) + R2 `co-note-images` 绑定
  - `workers/app.ts` (新建): Worker 入口, v7 `AppLoadContext` 增强注入 `context.cloudflare.env`
  - `workers/env.d.ts` (新建): Env 类型 (DB/IMAGES/各 Secret)
  - `migrations/0001_init.sql` (新建): 7 张表 + 4 个索引, 本地迁移已应用
  - `app/server/`: `auth.ts` (签名会话 Cookie)、`oauth.ts` (Google OAuth PKCE)、`db.ts` (D1 封装)、`pusher.ts` (Pusher 实例)
  - `app/lib/`: `types.ts` (共享类型)、`api.ts` (客户端 fetch 封装)
  - `app/routes.ts` + `app/routes/`: `home.tsx` 重写 (登录引导 + 背景板列表 + 账户菜单)、`auth.login/callback/logout.tsx`、`api/user.tsx`、`api/boards.tsx` (新建)
  - `app/root.tsx` / `app/app.css`: Patrick Hand + LeMiXiaoNaiPaoTi 字体、米纸色主题
  - `app/entry.server.tsx` (新建): web 版 SSR 入口 (renderToReadableStream)
  - 删除: `app/welcome/*` (模板组件)、`app/server/context.ts` (v8 专用, 降级后移除)
  - `tsconfig.json`: 加入 @cloudflare/workers-types; `.gitignore`: 忽略 `.wrangler/`
- **改动:**
  - 云端: 创建 D1 `co-note` (APAC) 与 R2 bucket `co-note-images`; 应用 0001_init 迁移 (本地)
  - 身份: Google OAuth (Authorization Code + PKCE) 全流程, 登录后签发 30 天签名会话 Cookie, 未登录 API 返回 401
  - 首页: 未登录显示 Google 登录按钮, 登录后显示背景板列表/新建/账户菜单 (复制用户 ID、登出)
- **踩坑记录:**
  - React Router v8 与 @cloudflare/vite-plugin 存在 dev 集成缺口 (双模块图导致 React 双实例), 按官方模板降级至 v7 解决
  - v7 模板关键配置: cloudflare 插件置于插件列表首位并绑定 ssr 环境; `environments.ssr.optimizeDeps.include` 显式声明 SSR 依赖避免运行时动态预打包崩溃
  - `window` 等浏览器 API 不可在 SSR 组件顶层使用 (改 useSearchParams)
- **最终结果:** dev server 正常: 首页 200 (SSR)、`/auth/login` 302 跳转 Google (PKCE 参数完整)、`/api/user`/`/api/boards` 未登录 401、typecheck 通过。
