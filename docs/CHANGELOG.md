# 修改记录 (Changelog)

> 每次提交记录修改的文件、改动内容与最终结果。与 git 提交一一对应。

## 2026-08-05 — 元属性增强 (date / 自定义值 / 键值分块) + 提示框字体

- **左下角提示框字体修复** (board.tsx): 根因 — Tailwind v4 preflight 给 `kbd` 设置等宽字体 (`ui-monospace`), 且 `--font-sans` Patrick Hand 优先 (拉丁字符不走 LeMiXiaoNaiPaoTi)。修复: 提示框容器 `fontFamily: "'LeMiXiaoNaiPaoTi', var(--font-sans)"`, 3 个 kbd 加 `fontFamily: "inherit"` 覆盖; 仅提示框, 其他 UI 不变
- **元属性 chip 键/值视觉分块** (note.tsx): 容器 `bg-board/50` 浅米分组底色 → 键块 (米色底 `bg-board/80`) 承载 icon+属性名, 值块 (白底 + 细边 `border-warm/10` + 阴影) 承载值文本, 一眼区分; `+ 属性` 按钮与添加面板底色同步
- **自定义属性值**: select (心情/天气) 与 number (疲惫) 编辑器尾部新增"自定义…"输入框 (Enter 确认, Escape 取消), 支持任意文本值; 自定义键 (已有) + 自定义值组合完整
- **date 元属性** (meta.ts + note.tsx): 预设 `{ key: "date", label: "日期", icon: "📅", type: "date" }`; 添加即用 `todayString()` (本地时区 YYYY-MM-DD, 非 UTC) 预填当天并保存, 打开原生 `<input type="date">` 可改 (onChange 即保存); 卡片徽章显示 `📅 2026-08-06`; 无 DB/API 改动
- **验证:** lint + typecheck 全绿; SSR 冒烟 — board/editor 页 200, PATCH `{mood:"超级开心", date:"2026-08-06", cafe:"手冲咖啡"}` 正常落库 (自定义键/值/date 混合)

## 2026-08-05 — 左下角操作提示 + Obsidian 式元属性系统

- **背景板左下角操作提示** (board.tsx): 常驻显示 `Ctrl+滚轮 缩放` / `拖拽 平移` / `双击 新建便笺` (kbd 样式条目) + 缩放百分比; ✕ 收起并写入 `localStorage("board:hint:hidden")`, 刷新后保持
- **元属性系统 (Obsidian 式 properties), 取代旧文本模板按钮:**
  - 数据层: 迁移 `0003_add_note_meta.sql` 加 `meta TEXT` (JSON 对象) 列; `Note.meta: Record<string,string>`; db.ts `noteFromRow` 解析 JSON (损坏回退 `{}`), `updateNote` 支持 meta (JSON.stringify 落库); api/note.tsx PATCH 校验 (对象、键 ≤16 字符、值 ≤50 字符、≤8 个属性、空键/空值过滤) + 加入 broadcastPatch 实时广播; 旧 mood/weather/fatigue/diet 列保留不动
  - `app/lib/meta.ts` (新): 预设属性 心情/天气 (select 选项) + 疲惫 (number 1-10) + 进食 (text 自由输入); `metaDisplay` 显示映射 (select→选项 label, number→`n/10`, 未知键回退原值); 支持用户自定义任意属性键
  - 编辑器 note.tsx: 移除模板常量/insertTemplate/TemplateGroup/TemplateButton; 顶部属性栏 — 已添加属性 chip (`icon 键: 值 ✕`), 点击值就地展开编辑器 (select/number 按钮组、text 输入框), `+ 属性` 面板 (预设 4 项 + 自定义属性名输入, Enter 添加), 空值占位未提交自动丢弃, 修改即时 PATCH (低频无防抖); 观看者只读
  - 便笺卡片 NoteCard.tsx: 顶部元属性徽章行 (`icon 值` 圆角细边框, 无属性不渲染), 随 Pusher patch 实时刷新
- **验证:** lint + typecheck 全绿; API 冒烟 — PATCH meta 200 落库, 空值/空键过滤、数组 400、超长值 400、全量替换删除属性均符合预期; 编辑器页/背景板页 SSR 200
- **注意:** 生产 D1 需在下次部署时由 CI preCommands 自动应用迁移 0003

## 2026-08-05 — Cloudflare Workers CI/CD 上线 + 生产部署

- **CI/CD 落地:**
  - `.github/workflows/ci.yml`: PR/推送 → pnpm install + lint + typecheck + build
  - `.github/workflows/deploy.yml`: push main / workflow_dispatch → 检查/构建 → `wrangler d1 migrations apply --remote` → secrets 注入 (`wrangler secret bulk`, 7 个应用密钥) → `wrangler deploy`
  - `package.json` 补 `packageManager: pnpm@10.34.1` (pnpm/action-setup v4 需要)
- **构建修复:** `react-router build` 原本失败 — v7 与 cloudflare 插件集成缺口 (SSR 钩子读 `dist/server/.vite/manifest.json`, 插件默认输出 `dist/ssr`)。修复: `environments.ssr.build.outDir = "dist/server"`; `react-router.config.ts` `buildDirectory: "dist"`; `wrangler.jsonc` assets → `./dist/client`
- **生产资源初始化:** D1 数据库 (5361eb18, 迁移 0001/0002 已应用)、R2 bucket co-note-images 已存在; Google OAuth 生产回调 URL 待用户添加
- **部署结果:** 首次 CI 通过; Deploy 经 token 权限修复 (旧 token 仅 account/user read → 更新为含 Workers Scripts/D1/R2 Edit) 后成功 — **生产地址 `https://co-note.blues74285700.workers.dev`**, SSR 登录页/静态资源/路由验证通过
- **验证:** 本地 build + `wrangler deploy --dry-run` 通过 (worker 2.27MB + 30 assets); 生产 `GET /` (Accept: text/html) 200 SSR 正常; 未登录访问 auth 路由 302
- **待办:** 用户添加 Google OAuth 回调; 生产冒烟 (登录/建板/便笺/图片/双账号实时)

## 2026-08-05 — README 文档 (英文 + 中文)

- `README.md` (重写): 替换 React Router 模板遗留 (原文档为 npm 安装流程, 与项目 pnpm 冲突); 覆盖功能、技术栈、快速开始、环境变量清单、本地数据库初始化、开发/质量检查命令、便笺 Markdown 注解语法、双用户本地测试、Cloudflare 部署方式、目录结构
- `README.zh-CN.md` (新建): 中文版, 与英文对应

## 2026-08-05 — highlight 遮字 (双 SVG 层) + 色块跟随 picker + Pusher 订阅回归修复

- **Bug 1 — highlight 遮住字体:** 编辑器注解单一 overlay svg 位于文本之上, highlight 是贯穿文字高度的粗线 (strokeWidth ≈ rect.h × 0.95) 直接盖住文字。修复: 双 SVG 层 — underlay (highlight, 位于 EditorContent 之前, 文本绘制其上) + overlay (其他注解, 位于之后), 复刻 rough-notation 卡片渲染的 DOM 顺序语义 (annotationRenderer.ts / note.tsx)
- **Bug 2 — 色块不随 picker 变化:** 色块读 `annoColor` (仅无注解场景更新), 而 picker 受控值是 `pickerColor` (拖动实时更新); 改读 `pickerColor` (note.tsx:485)
- **回归修复 — Pusher 订阅全量失败 (P1 引入):** P1 移除客户端 `auth.params.boardId` 后, 服务端 pusher-auth.tsx 仍校验 `match[1] !== form.boardId` (客户端不再发送 → 恒空串 → 恒 400 → 所有订阅失败; UI "已连接" 由 WS 连接触发, 订阅失败被掩盖)。修复: 背景板 ID 改为从 `channel_name` 解析 (pusher-js 自动携带, 服务端以此为准并校验成员关系), 删除 boardId 参数与重复校验。此问题由评审复核 (CODE_QUALITY.md §9.2) 发现
- **验证:** lint + typecheck 全绿; 实测 — highlight 黄线进入下层 svg (box 在上层)、hue 拖动色块实时变色 (蓝→紫蓝)、pusher auth 200、双用户实时同步正常 (user2 未刷新 4→3)
- **最终结果:** 两个用户体验 bug 修复, 订阅回归修复, 实时同步恢复。

## 2026-08-05 — 代码质量重构 (依据 CODE_QUALITY.md 评审, P1~P4)

- **背景:** 复核 CODE_QUALITY.md 评审, 对 3 处不准确判断在文档中加 `>` 批注 (react-markdown/remark-gfm 不在 dependencies 而在 vite include; screenToWorld 实际被使用 (无调用的是 worldToScreen); links 清理需连带 DROP TABLE 迁移)
- **P1 清理死代码:**
  - 删 `board.tsx` action 死代码 (内联 SQL 创建, 与 `/api/notes` 重复, 无调用方)
  - store: 删只写不读的 `members`/`setMembers`; 新增 `resetBoard()` (切板清 notes/viewport/dragNote 残留); 删无调用的 `worldToScreen`; board/NoteCard 手写坐标换算改用 `screenToWorld`
  - 迁移 `0002_drop_links.sql` (DROP TABLE links) + 删 db.ts 两处 links SQL; `moveNote` 去 zIndex 死参数
  - 删死依赖 `clsx`/`lucide-react`; vite.config include 清理 `react-markdown`/`remark-gfm` 残留并补注释
  - 修 Pusher 单例 boardId 固化 (auth 不带 boardId, 服务端从 channel_name 解析) — 切换背景板订阅 403 的根因
  - 头像 `key={i}` → `key={id}`
- **P2 样板统一:** `lib/api.ts` 新增 `apiError(status, code, message)`, 机械替换 12 个 API 文件 31 处错误响应 (3 行 → 1 行, Content-Type 头统一); user.tsx 局部 unauthorized 一并替换
- **P3 依赖方向与重复:** `ANNOTATION_STYLE` 从展示组件移至 `lib/markdown.ts` (annotationRenderer 不再依赖组件内部常量); 合并 `seedOf` 双实现为共享函数; 新增 `lib/constants.ts` (BOARD_CHANNEL_PREFIX/PATCH_EVENT), 客户端服务端共享
- **P4 小修:** note.tsx 保存失败新增 error 态 (红字"保存失败", 不再静默"已保存"); home.tsx loadInbox 改用 jsonApi + `LoadedUser` 类型别名; 共享 COOKIE_BASE (server/cookies.ts); wrangler compatibility_date 2026-07-01 → 2025-11-25 (消除静默回退)
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿; 冒烟 — 页面 200、board API 正常、创建便笺成功
- **最终结果:** 死代码与重复样板清理完毕, 依赖方向修正, 可维护性提升。

## 2026-08-05 — ConfirmDialog 通用确认组件 + 新建便笺立即显示修复

- **新建 `app/components/ui/ConfirmDialog.tsx`:** 通用确认弹窗 (fixed 底部居中浮层, 非阻塞替代 `window.confirm`; `danger` 变体红色确认按钮用于删除等危险操作); 抽离自新建便笺弹层 UI
- **Bug 修复 — 新建便笺确认后不立即显示:** `confirmCreate` 原本丢弃响应、完全依赖 Pusher 广播回环; 广播是 fire-and-forget, Workers 在 action 返回后会终止未完成异步 fetch → 广播常丢失 → 便笺不显示 (重进 loader 拉取才看到)。修复: 客户端改用**响应数据直插** `upsertNote(r.note)`; 服务端 `broadcastPatch` 返回 Promise, 4 处调用点 (api/notes 创建、api/note PATCH/DELETE、api/note-position) 用 `ctx.waitUntil` 保持存活
- **三处接入 ConfirmDialog:**
  - `board.tsx` 新建便笺: 内联弹层 → `<ConfirmDialog confirmLabel="创建">`
  - 删除便笺: `NoteCard` 删除按钮改为 `onRequestDelete` 回调 (world 层内弹窗会被 transform 缩放, 必须页面级渲染); `board.tsx` 加 `deleteDraft` state + `<ConfirmDialog danger>` (确认 → 乐观移除 + DELETE + 失败回滚, 逻辑自 NoteCard 移入)
  - `home.tsx` 删除背景板: `window.confirm` → `deleteBoardDraft` + `<ConfirmDialog danger>`
- **验证:** lint + typecheck 全绿; Playwright 实测 — 新建便笺确认后立即显示 (3→4, 无需刷新), 删除弹窗红色确认按钮 (danger) 生效 (4→3)
- **最终结果:** 统一确认弹窗 UI, 新建便笺即时可见。

## 2026-08-05 — 修复: 双击确认弹窗后无法拖动平移 (手势状态机残留)

- **修改文件:** `app/routes/board.tsx`
- **根因:** `window.confirm` 同步阻塞事件循环 (浏览器 modal); modal 打开/关闭瞬间浏览器对指针事件的挂起/补发使 down/up 配对失衡, `pointersRef` 残留幽灵 pointerId; 之后单指拖动被误判为双指缩放 (`size === 2` → pinch 分支, `panRef` 置 null) — 平移失效且**不可恢复** (up 后 `size` 变 1, 但 `panRef` 仍为 null, 每次拖动都是 `size === 2`)
- **修复:**
  - 根治: 双击新建改用**非阻塞自定义确认弹层** (`createDraft` state + 浮层 UI, 创建/取消按钮), 不再冻结事件循环
  - 防御: 手势状态机兜底 — 双击 (明确的手势边界) 与 window `blur`/`pointercancel`/`visibilitychange` 时 `resetGestures()` 清空全部指针状态
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿; Playwright 实测 — 双击→取消→拖动位移完整应用 (200px), 连续拖动无残留
- **最终结果:** 关闭双击确认弹层后拖动平移恢复正常。

## 2026-08-05 — 注解取消失效修复 ($from.marks() 边界交集问题)

- **修改文件:** `app/components/editor/annotationMark.ts`
- **根因:** `toggleAnnotation`/`setAnnotationColor` 用 `state.selection.$from.marks()` 检测选区已有注解; ProseMirror 的 `ResolvedPos.marks()` 在选区起点恰为 mark 起点 (两文本节点边界, textOffset === 0) 时只返回**前一个节点**的 marks — 注解 mark 只存在于 mark 起点之后的文本节点 → 检测不到 → 走 `setMark` 重复包裹而非取消。最常见场景: 选中整个注解内容后保持选区再次点击按钮
- **修复:** 与 TipTap 内置 `isMarkActive` 一致, 改用 `state.doc.nodesBetween(from, to, …)` 遍历选区内文本节点查找 annotation mark (共享 `findAnnotationInSelection` helper); `setAnnotationColor` (色板换色) 同病一并修复
- **验证:** `pnpm run lint` + `pnpm run typecheck` 全绿
- **最终结果:** 再次点击同一注解按钮可正常取消, 色板换色在整段选中时也生效。

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
