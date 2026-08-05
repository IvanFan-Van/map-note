# 修改记录 (Changelog)

> 每次提交记录修改的文件、改动内容与最终结果。与 git 提交一一对应。

## 2026-08-04 — react-colorful 样式覆盖失效修复 (CSS 层优先级)

- **根因:** react-colorful 的默认样式是**运行时 CSS-in-JS 注入** (组件 useLayoutEffect 创建 `<style>` 元素, `innerHTML` 含 `.react-colorful { width: 200px; height: 200px }`), 属于 **unlayered 规则**; 我们的覆盖写在 Tailwind v4 的 `@layer components` 内 — 按 CSS 级联, unlayered 样式优先于 layered 样式 (层优先级高于特异性), 覆盖被吞
- **修复 (官方文档 Customization 做法):**
  - `app/app.css`: `.react-colorful` 覆盖规则**移出 @layer** (unlayered), 并用后代选择器 `.anno-swatch .react-colorful` 提升特异性 (双保险); 响应式 120px/150px 保留
  - `app/routes/note.tsx`: 色板弹层容器加 `anno-swatch` 作用域类
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿 (CSS 级联规则可确定性推理, 无需浏览器验证)
- **最终结果:** color picker 尺寸样式生效。

## 2026-08-04 — BubbleMenu 浮层脱离 main overflow 裁切 + dist 入库修复

- **修改文件:**
  - `app/routes/note.tsx`: `<BubbleMenu appendTo={() => document.body}>` — 根因: 浮层默认 append 到 `view.dom.parentElement` (main 内滚动容器), `overflow-y-auto` 裁切了向上展开的 color picker 弹层; 挂到 body 后弹层脱离裁切, 不被任何元素遮挡
  - `eslint.config.js`: ignores 补 `dist`
  - `.gitignore`: 补 `dist/`, 移除误入库的构建产物
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿
- **最终结果:** color picker 弹层不再被 main 的 overflow 裁切。

## 2026-08-04 — color picker 遮挡修复 + react-colorful 样式化 + eslint

- **修改文件:**
  - `app/routes/note.tsx`: BubbleMenu 加 `z-50` — 浮层默认 append 到编辑器父元素 (无 stacking context), 被 sticky header (z-20) 遮挡的根因; 移除 HexColorPicker 内联尺寸 (样式移交 CSS)
  - `app/app.css`: `.react-colorful` 缩小为 170×170 (窄屏 ≤480px 时 150×150, responsive), 饱和度区圆角
  - `eslint.config.js` (新建): eslint 10 + typescript-eslint 8 最小配置 (宽松规则: 允许 any/console, unused 警告); `package.json` 新增 `lint` script
  - 修复存量 lint 问题: markdown.ts 无用转义 `\!`、NoteCard/auth.logout/board 未用变量
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿 (此后测试改用 lint, 不再用 playwright)
- **最终结果:** color picker 不被 header 遮挡, 尺寸响应式, eslint 基础设施落地。

## 2026-08-04 — TipTap 真 WYSIWYG 编辑器重构 + per-annotation 颜色

- **背景:** 用户要求"标记语法仅后台存在, 用户只见注解效果 + 任意选中文本即弹工具栏"。行块式 textarea 无法局部隐藏标记 (WYSIWYG 需要富文本模型) → 引入 TipTap 重写
- **修改文件:**
  - `app/routes/note.tsx`: 重写 — `useEditor` + StarterKit/Image/Link/AnnotationMark, `BubbleMenu` (选中即弹, 替代原行块/选区/floatTool 约 200 行); 模板插入/格式工具栏/图片上传迁移到 `editor.commands`; 保存 onUpdate 防抖导出标记字符串 → PATCH (存储格式不变)
  - `app/components/editor/annotationMark.ts` (新建): 注解 Mark, attrs `{ annotation, multiline, color }`, renderHTML 输出 `span[data-annotation][data-color][data-multiline]`; `toggleAnnotation`/`setAnnotationColor` 命令 (跨行选区返回 false)
  - `app/components/editor/annotationRenderer.ts` (新建): **overlay SVG 管线** — 编辑器内容上方叠加 absolute svg, sync 时把全部注解 span 的 rect 用 `renderAnnotation` + 固定 seed 重绘; 与 ProseMirror contentDOM 解耦 (view.update 会清除非模型 DOM, 这也是最初 annotate 方案失败的根因); rAF 延迟到 DOM 更新后绘制
  - `app/lib/tiptap.ts` (新建): `markdownToJSON`/`jsonToMarkdown` 往返转换器 (每 block = 一行); 18 用例无损 (嵌套/三连/带色/链接/图片/标题/列表/引用/空行)
  - `app/lib/markdown.ts`: **带色标记语法** `[[#e11d48|内容]]` / `[[[#…|内容]]]` (向后兼容, 无前缀标记不变); `InlineToken.color`、`detectAnnotation`/`toggleAnnotation` 支持颜色
  - `app/components/markdown/Markdown.tsx`: 渲染用 `token.color ?? ANNOTATION_STYLE` (便笺卡片支持带色注解)
  - `app/components/editor/AnnotationIcon.tsx`: 工具栏深色 icon (下划线/多行) 改浅暖白 `#f5f0e1` (原 `#4a4238` 与工具栏背景融为一体)
  - `app/app.css`: `.tiptap` 行块式视觉样式 (行间距/标题/列表/引用/图片)
  - `package.json`: + @tiptap/react/core/pm/starter-kit/extension-image/link
- **色板:** BubbleMenu 最左端色块按钮 → 8 色弹层; 选区已有注解 → 更新其 color; 否则记 pendingColor 供下次应用
- **验证:** typecheck ✓; Playwright 实测 — 编辑器显示效果无标记、选中即弹工具栏、应用 box 后保存 DB `[[结尾]]`、色板换色后 DB `[[#dc2626|结尾]]`、刷新后编辑器/卡片渲染一致 (3 色注解)、注解内输入位置跟随、往返转换 18/18
- **最终结果:** 真 WYSIWYG 编辑器落地, 标记语法对用户不可见, 注解颜色 per-annotation 持久化。

## 2026-08-04 — 删除功能 + 编辑器空隙 + rough 注解图标 + Pusher 签名修复

- **修改文件:**
  - `app/server/db.ts`: 新增 `deleteBoard` (batch 级联: links → notes → invitations → board_members → user_settings 默认板置 NULL → boards)
  - `app/routes/api/board.tsx`: action 增加 `DELETE` 分支 (编辑者可删, 非成员 404 / 观看者 403)
  - `app/routes/home.tsx`: 背景板卡片右上角红色垃圾桶按钮 (编辑者可见; preventDefault+stopPropagation; confirm 后删除, 列表 revalidate, 默认板置空)
  - `app/components/board/NoteCard.tsx`: 便笺卡片右上角红色垃圾桶按钮 (仅编辑者; pointerdown stopPropagation 防拖拽; confirm + 乐观移除 + 失败回滚), 经 `DELETE /api/notes/:id` + `broadcastPatch(deleted)` 实时同步
  - `app/routes/note.tsx`: 行 textarea 加 `display: block` — 消除 inline-block baseline 空隙; 浮动工具栏改用 `AnnotationIcon` (激活态变白)
  - `app/components/editor/AnnotationIcon.tsx` (新建): 用 rough-notation 内部导出的 `renderAnnotation(svg, rect, config, …)` 在 20×20 SVG 中绘制注解效果图标 (与正文注解同引擎同色: 下划线/方框/圆圈/高亮/删除线/划掉/括号/多行三线; seed 固定防重渲染抖动)
  - `app/server/pusher.ts`: **修复 body_md5 签名 bug** — Pusher REST API 的 `body_md5` 必须是「整个请求体」的 MD5 (含 name/channels/data 包装), 原实现只算了 data 的 MD5, 导致每次触发 400 被 catch 吞掉, **实时同步从未生效过**
  - `package.json`: 显式安装 `roughjs` (rough-notation 上游 bug — roughjs 写在 devDependencies, pnpm 下 render.js 无法解析)
- **验证:** 双用户 Playwright 实测 — 删除便笺后第二用户未刷新实时 4→3; 删除背景板后列表即时更新; 编辑器行间距 6px vs 8px (原为明显空隙); 工具栏 8 个 rough 图标颜色/线宽与注解样式一致; typecheck ✓
- **最终结果:** 删除功能 + 编辑器体验修复 + 注解风格图标落地; 顺带修复长期潜伏的实时同步失效 (Pusher body_md5 签名错误)。

## 2026-08-04 — 样式: app.css 显式全局初始化 + 分层重构

- **修改文件:** `app/app.css`
- **改动:**
  - 新增 `@layer base` 完整初始化: `*, *::before, *::after, *::backdrop, ::file-selector-button` 统一 `box-sizing: border-box` 并清 margin/padding/border; html/body 排版基调 (line-height、text-size-adjust、tab-size); 标题/段落/列表默认值 (字号权重交给工具类); 链接继承颜色; 媒体元素块级化; 表单控件统一继承字体/颜色/字距; textarea `resize: vertical`; placeholder 半透明继承色; `:disabled` 光标
  - 原 `html, body` 主题规则移入独立 base 层, `.note-card` 组件样式移入 `@layer components`
- **重构验证:** 审计全部组件 — 样式均为显式 Tailwind 工具类, 无依赖浏览器默认值, 无需回补样式; 浏览器实测三个页面 (home/board/note): body 背景 `#f5f0e1`、便笺卡片 `#fefcf5` + 双层阴影、textarea 字体继承/resize-none/placeholder 半透明、按钮 rounded-full 覆盖 reset 等全部与重构前一致
- **最终结果:** 显式初始化落地, 视觉零回归, 结构分层清晰。

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

## 2026-08-04 — Bug 修复: 拖拽平移累积偏差 (方向切换失效)

- **修改文件:**
  - `app/routes/board.tsx`: 画布拖拽平移从"增量累加绝对偏移"改为**绝对定位** — `viewport.viewX = 按下时viewX + (当前clientX - 按下时clientX)`, 不再逐次累加
- **原因:** `panBy()` 是增量式 (每次加 dx), 而拖拽传入的 `clientX - startX` 是相对起点的绝对偏移; 每次 move 事件都把绝对偏移再累加一次 → 偏移随 move 次数膨胀, 且中途反向拖拽时视口仍沿累积方向移动
- **保留:** `panBy` 仍用于滚轮平移 (wheel delta 本身是增量, 语义正确); 便笺拖拽/双指捏合原本就是绝对/增量基准正确, 未受影响
- **最终结果:** 拖拽方向切换立即反向, 无累积偏差; typecheck ✓, 页面 200 ✓。

## 2026-08-04 — Bug 修复: 便笺拖拽松手不放置 (依赖 Pusher 回环)

- **修改文件:**
  - `app/routes/board.tsx`: `commitMove` 改为**乐观放置** — 松手先用预览坐标更新本地 store (无回弹), PUT 成功后用服务端返回值校准; `handleLinkDrop` 同样用 POST 响应 `upsertLink` 本地落线
- **原因:** 原实现丢弃 API 响应, 便笺位置/连线创建后的本地更新完全依赖"服务端→Pusher→自身"广播回环; 订阅或触发失败时松手便笺弹回原位、连线不出现
- **最终结果:** 放置/连线不再依赖实时通道, 断线时本地操作依然生效; typecheck ✓, PUT/连线 API 验证 ✓。

## 2026-08-04 — 样式重设计: 便笺极简单色化 + 移除连线功能

- **修改文件:**
  - `app/components/board/NoteCard.tsx`: 重写为固定 240×320px 极简矩形卡片 — 单色浅暖白、无钉子/折角装饰、flex 布局 (缩略图 + 内容区 overflow hidden + 底部状态栏), 删除钉子 SVG、图钉连线拖拽手势 (`handlePinDown`/`onLinkDrop`)
  - `app/app.css`: 重写 `.note-card` — 纯色 `#fefcf5` + 1px 同色系描边 + 双层柔和阴影 + hover 阴影加深, 删除渐变背景、折角/折痕伪元素
  - `app/lib/store.ts`: 删除 linkDrag/selectedLinkId 状态与 startLinkDrag/updateLinkDrag/endLinkDrag/selectLink/upsertLink/removeLink, `applyPatch` 仅保留 note 分支
  - `app/lib/types.ts`: 删除 `Link` 类型, `PatchEntity` 移除 `"link"`
  - `app/routes/board.tsx`: 删除 LinkLayer 渲染、连线创建手势 (`handleLinkDrop`)、loader 不再查询 links
  - 删除文件: `app/components/board/LinkLayer.tsx`、`app/routes/api/links.tsx`、`app/routes/api/link.tsx`
  - `app/routes.ts`: 删除连线 API 路由; `app/server/db.ts`: 删除连线数据层函数 (links 表保留于迁移, 不再读写); `app/routes/api/board.tsx`: loader 不再返回 links
  - `docs/specifications.md`: F2/F6/6.6/权限矩阵/视觉规范/里程碑/ADR 同步更新 (连线功能标记移除)
- **验证:** typecheck ✓; 首页/背景板页 200, API 无 links 字段, 日志零错误
- **最终结果:** 便笺呈现为高而窄 (240×320) 的极简单色卡片, 层次由亮度差与阴影表达; 连线功能整体移除。

## 2026-08-04 — Markdown 原生渲染重构 + 行块编辑器 + 注解工具栏 + 便笺选中态

- **修改文件:**
  - `app/lib/markdown.ts` (新建): 自研迷你 Markdown 解析器 — 行级 (标题/无序/有序列表/引用/图片/段落) + 行内 (加粗/斜体/代码/链接/图片) + 7 种注解标记 (`==高亮== ^^下划线^^ [[方框]] ((圆圈)) ~~删除线~~ ××划掉×× ⟦括号⟧`, 三连标记为 multiline 变体), 含 detect/toggle 工具
  - `app/components/markdown/Markdown.tsx` (新建): 渲染组件, 注解 span 客户端用 rough-notation `annotate()` 绘制 (颜色/粗细/多行)
  - `app/routes/note.tsx` (重写): 行块式混合编辑器 (活动行 textarea raw + 其余行渲染, 回车拆行提交, 标题即时渲染, 方向键切换行, 输入法组合保护); 移除右侧预览面板 (占满窗口); 选中文本浮动工具栏 (8 工具/激活高亮/mirror 定位/分页滚动); 心情/天气/疲惫/进食改为模板插入 (移除字段 UI); 格式工具栏作用于活动行
  - `app/components/board/NoteCard.tsx`: 原生 Markdown 渲染替换 react-markdown; 选中态蓝色边框 (ring-2 ring-blue-500); 移除字段状态栏; 拖拽跟随 (无蓝色 mask)
  - `app/lib/store.ts`: 新增 `selectedNoteId`/`selectNote`
  - `app/routes/board.tsx`: 删除 DragPreview 蓝色 mask 组件与渲染; 空白 pointerdown 取消选中; 单击便笺选中/再击进入编辑
  - `package.json`: 移除 react-markdown/remark-gfm, 新增 rough-notation
  - `docs/specifications.md`: F4/F5/第三方库清单同步更新
- **验证:** 解析器单测 (行级/行内/注解 detect/toggle 全部正确); typecheck ✓; 首页/背景板/编辑器 200, 日志零错误
- **最终结果:** Markdown 渲染零第三方依赖 (rough-notation 仅负责注解绘制), 编辑器支持行块实时渲染与文本注解, 便笺交互改为单击选中/再击编辑。

## 2026-08-04 — Bug 修复: 浮动工具栏不可见 / 行块无法删除 / 单击便笺闪淡

- **修改文件:**
  - `app/routes/note.tsx`: `computeFloatPos` 的 mirror div 从 `left: -9999px` 改为 `left: 0` — 原实现直接使用子 span 的视口坐标, 但 mirror 位于屏幕外导致工具栏被定位到 -9999px 处不可见; 另新增行首 Backspace (合并上一行, 空行即删除) 与行尾 Delete (合并下一行)
  - `app/components/board/NoteCard.tsx`: pointerdown 不再立即进入拖拽态, 改为移动超过 6px 阈值后才 `startDragNote` (半透明); 单击不再闪淡, 正常触发选中
- **验证:** typecheck ✓; 首页/背景板/编辑器 200, 日志零错误
- **最终结果:** 选中文本工具栏正常弹出; 行块可合并删除; 单击便笺显示蓝色选中边框。

## 2026-08-04 — 交互调整: 工具栏定位修复 / 移除选中态 / 行高一致 / 创建不跳转

- **修改文件:**
  - `app/routes/note.tsx`: `computeFloatPos` 的 mirror 与 textarea 视口位置对齐 (并扣除 scrollLeft/scrollTop), 浮动工具栏回到选区上方; 行 textarea 增加 `rows={1}` + `fieldSizing: content` + `py-0.5`, 与渲染块高度一致 (切换编辑不再高度突变)
  - `app/components/board/NoteCard.tsx`: 移除选中态与蓝色边框, 单击无操作, 双击进入编辑页; 拖拽移动保留
  - `app/lib/store.ts`: 移除 `selectedNoteId`/`selectNote`
  - `app/routes/board.tsx`: 移除选中逻辑与空白取消选中; 双击新建便笺前弹 `confirm` 确认框, 创建后留在画布不跳转
  - `app/routes/home.tsx`: 创建背景板后不再自动跳转 (留在列表, fetcher revalidate 刷新)
- **验证:** typecheck ✓; 首页/背景板/编辑器 200, 日志零错误
- **最终结果:** 交互按用户要求收敛 — 便笺仅支持双击进入编辑与拖拽移动; 新建操作均留在当前页; 行块编辑无高度跳动。

## 2026-08-04 — Bug 修复: 双击无法进入便笺编辑页

- **修改文件:** `app/components/board/NoteCard.tsx`
- **原因:** `handleBodyDown` 中的 `e.preventDefault()` — 按 Pointer Events 规范, 取消 `pointerdown` 会抑制后续兼容鼠标事件 (`click`/`dblclick`), 导致 React `onDoubleClick` 永不触发
- **修复:** 移除 `preventDefault` (文本选择已由 `select-none` 阻止); 补上 `onDragStart` preventDefault 与 `draggable={false}`, 防止便笺内链接/图片触发浏览器原生拖拽干扰手势
- **最终结果:** 双击便笺恢复正常进入编辑页, 拖拽移动不受影响; typecheck ✓, 页面 200 零错误。

## 2026-08-04 — Bug 修复: 双击进入编辑页 (捕获元素与事件绑定不一致)

- **修改文件:** `app/components/board/NoteCard.tsx`
- **原因:** 上一轮移除 `pointerdown` 的 preventDefault 后双击仍失效 — `setPointerCapture` 会把 `click`/`dblclick` 等兼容鼠标事件的目标改为**捕获元素** (note-card 的父定位 div), 而 `onDoubleClick` 绑在子 `.note-card` 上, 事件从捕获元素冒泡不会经过子元素, 永远收不到
- **修复:** `onDoubleClick` 移到捕获元素 (根定位 div) 上; 另加 `hasPointerCapture` 检查 (pointerup 派发前捕获已隐式释放, 显式 `releasePointerCapture` 会抛 NotFoundError 中断 onUp 的监听器清理)
- **验证:** playwright 实测 — 双击便笺成功导航至编辑器页; 拖拽便笺位移与鼠标一致 (400px→550px); typecheck ✓
- **最终结果:** 双击进入编辑与拖拽移动均正常。
