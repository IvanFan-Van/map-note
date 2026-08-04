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

## 2026-08-04 — M2~M6: 无限画布、便笺、编辑器、连线、协作与实时同步

- **修改文件:**
  - `app/routes/board.tsx` (新建): 无限画布 — Ctrl+滚轮/双指缩放 (0.25×~4×, 光标锚点)、拖拽平移、空白双击创建便笺、便笺渲染、蓝色 mask 拖拽预览、图钉拖拽连线、顶部工具栏 (返回/板名/默认板星标/在线成员/连接状态/邀请/只读标记)
  - `app/routes/note.tsx` (新建): 便笺编辑器 — Markdown 编辑+实时预览、工具栏 (加粗/斜体/标题/列表/链接/图片)、图片上传 (R2, 自动插入 markdown)、心情/天气/疲惫/进食快捷状态栏、防抖自动保存
  - `app/components/board/NoteCard.tsx` (新建): 纸张质感卡片 (米黄渐变/折角/折痕)、大头钉、缩略图堆叠 (最多 3 张错位)、状态角标、拖拽/点击/连线手势
  - `app/components/board/LinkLayer.tsx` (新建): SVG 贝塞尔连线 (图钉到图钉)、选中浮层 (6 色色板/粗细滑块/删除)、橡皮筋预览
  - `app/lib/store.ts` (新建): zustand 画布状态 (视口/便笺/连线/拖拽/连线手势/补丁合并)
  - `app/lib/pusher.ts` (新建): pusher-js 客户端 (presence 频道订阅/成员事件/补丁分发/连接状态)
  - `app/server/permissions.ts` (新建): 成员/编辑者权限守卫 + Pusher 广播封装
  - `app/server/db.ts`: 新增便笺/连线/邀请/收件箱/默认板/板详情等全部数据函数
  - API 路由 (新建): `api/notes`(POST)、`api/note`(PATCH/DELETE)、`api/note-position`(PUT)、`api/links`(POST)、`api/link`(PATCH/DELETE)、`api/invitations`(POST)、`api/invitations/inbox`(GET)、`api/invitation`(accept/decline)、`api/board`(详情/设默认)、`api/images`(上传)、`api/pusher/auth`(频道鉴权)、`images/*`(R2 代理, splat 路由)
  - `app/routes/home.tsx`: 收件箱 (铃铛+红点+接受/拒绝)、默认板星标与"继续进入"横幅、账户菜单
  - `app/app.css`: 便笺纸张质感与折角样式; `vite.config.ts`: SSR 依赖预打包清单补全
- **验证 (curl + 本地 D1 双用户):** 创建/更新/移动/删除便笺 ✓; 连线创建 ✓; 邀请→收件箱→接受→viewer 只读 (写操作 403) ✓; 默认板 ✓; 图片上传/鉴权读取 ✓; 页面路由未登录重定向登录页 ✓; typecheck ✓
- **最终结果:** 规格中 F1~F9 全部功能已实现; Pusher 触发使用占位凭据 (已捕获失败不影响业务), 待用户提供真实凭据后实时广播生效。

## 2026-08-04 — Bug 修复: 双击创建 404 / 平移便笺乱飞 / Ctrl+滚轮缩放 / Pusher workerd 崩溃

- **修改文件:**
  - `app/routes/board.tsx`: wheel 改为原生非 passive 监听 (`addEventListener("wheel", ..., { passive: false })`), `preventDefault()` 生效, 不再触发浏览器默认缩放
  - `app/components/board/NoteCard.tsx`: 定位从屏幕坐标改为世界坐标 (便笺在已带 translate+scale 的 world 层内, 原双重变换导致平移/缩放时便笺乱飞)
  - `app/root.tsx` + `app/app.css`: 字体 `@font-face` 从 CSS 移到 root 注入 — `import fontUrl from "~assets/LeMiXiaoNaiPaoTi.TTF?url"` (vite 生成绝对 URL), 修复深层路由下相对路径被解析成 `/b/assets/...` 导致的 404
  - `tsconfig.json`: 新增 `~assets/*` 别名 (runner 拒绝 app 目录外的相对导入)
  - `app/server/pusher.ts` + `app/routes/api/pusher-auth.tsx` + `app/server/permissions.ts`: 弃用官方 `pusher` npm 包 (底层 node:http 在 workerd 兼容层崩溃 "Cannot read properties of null (reading 'has')"), 改为纯 fetch 实现 Pusher REST API (MD5 body 签名 + HMAC-SHA256 auth_signature, 使用 @noble/hashes)
  - `package.json`: 新增 `@noble/hashes`; `vite.config.ts`: 预打包列表补充 @noble/hashes 子路径
- **验证:** 首页/编辑器页 200; 字体资源 `/assets/LeMiXiaoNaiPaoTi.TTF` 200 (4.6MB); 创建便笺 200 且 Pusher 真实触发无错误; 日志零错误 (无 No route matches / Denied ID / pre-bundle / trigger failed); typecheck ✓
- **最终结果:** 三个上报 bug 全部修复, 附带修复 Pusher 在 Workers 环境的兼容性问题。
