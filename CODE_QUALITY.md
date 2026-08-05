# CODE_QUALITY.md — 代码质量评审(可维护性视角)

> 评审基线: HEAD `4b93606`(2026-08-05)
> 评审视角: 可维护性 —— 代码复杂度 / 变量命名 / 函数规划 / 耦合性
> 评审原则: **可维护性应与项目规模同步**。本项目为单人/双人规模(约 20 个 TS 源文件、~4300 行),此阶段以**可读性**为首要目标,**反对过度设计**(不引入 Repository 模式、不拆微服务、不做防御式抽象)。所有建议按此原则分级:

| 级别 | 含义 |
| --- | --- |
| **A** | 强烈建议。影响可读性或正确性,改动小、收益大 |
| **B** | 建议。结构性改进,收益中等,可在功能稳定后做 |
| **C** | 可接受。在此规模下无需改动,避免过度工程 |

---

## 0. 总体评价

**总评: 中上水平,小项目基准下可读性良好。**

做得好的方面:
- **中文注释质量高且诚实** —— 多处注释记录了"为什么"(坑),如 `NoteCard.tsx:72`(为何不能 preventDefault)、`board.tsx:264-265`(为何不用增量平移)、`annotationRenderer.ts:10-13`(overlay 解耦原因)。这类"踩坑注释"是稀缺资产,比代码本身更值钱。
- **命名整体直白** —— `commitMove` / `confirmCreate` / `resetGestures` / `invitationFromRow`,无缩写谜语。
- **模块划分方向正确** —— 自研 markdown 解析器、TipTap 往返转换器、注解渲染管线都独立成文件,职责边界清晰。
- **实体行映射函数**(`noteFromRow` / `invitationFromRow`)统一了 snake_case ↔ camelCase 转换,是好模式。

主要问题集中在三处:
1. **页面路由文件过大**(`board.tsx` 507 行、`note.tsx` 558 行),且混入多种职责;
2. **样板代码重复**(错误响应构造在 API 路由中重复 20+ 次、坐标换算在三处手写、注解 seed 函数两处实现);
3. **死代码与死状态**(`store.members` 只写不读、`board.tsx` 的 action 无人调用、未用依赖 react-markdown/clsx/lucide-react 仍在 package.json)。

---

## 1. `app/lib/` — 共享层(整体健康)

### 1.1 `types.ts`(80 行)
- 纯类型定义,无逻辑。`PatchEntity` 中 `"board"` 已无广播场景(链接与板级 patch 已不存在),`PatchEvent` 的 `entity` 实际上只会是 `"note"`。**建议(C 级)**: 可收窄为字面量 `"note"`,但不是必须——保留类型宽度为将来扩展留余地,在项目当前阶段不算问题。

### 1.2 `api.ts`(43 行)
- 短小、职责单一。`ApiError` 带 `code/status`,错误处理链路清晰。
- **B 级建议**: 服务端错误响应格式 `{ ok:false, error:{ code, message } }` 在 20+ 个 API 路由中手工构造(见 §6),建议在此文件补一个 `apiError(status, code, message): Response` 帮助函数 —— 消除最大的一处重复样板,且能顺带统一 `Content-Type` 头。

### 1.3 `store.ts`(133 行)
- zustand 使用克制,actions 命名准确。
- **A 级: 死状态 `members`**(`store.ts:25,36,52,120`)。`board.tsx:146-151` 调用了 `setMembers` 写入 store,但渲染读的是本地 `membersLocal` state(`board.tsx:93`),**store.members 从未被任何代码读取**。要么删除 store.members 与 setMembers(推荐,board.tsx 顺带删两行),要么让渲染改读 store —— 当前是"两个状态源,实际用了一个"的迷惑状态。
- **A 级: 缺 `reset()`**。`setBoardData` 覆盖 notes,但 `dragNote` / `viewport` / `members`(若保留)跨板残留。加一个 `resetBoard()`(一行 `set({ notes:{}, viewport:{viewX:0,viewY:0,scale:1}, dragNote:null })`)比在调用方逐个清理更内聚。
- **B 级: 坐标换算函数未被使用**。`screenToWorld`(store.ts:44)与本文件 `worldToScreen` 一同导出,但 `board.tsx:174` 与 `NoteCard.tsx:77-78` 各自手写 `(clientX - viewX) / scale`,`board.tsx:145` 也是。三处手写 = 三个潜在 bug 点(视口公式改一处漏两处)。直接用导出的 `screenToWorld` 即可。
> **批注 (2026-08-05 复核)**: 论据需修正 — `screenToWorld` 实际被 `store.ts:105` (updateDragNote, 便笺拖拽坐标换算) 使用; 完全无调用方的是 `worldToScreen`。结论不变: board.tsx / NoteCard 两处手写换算应改用导出的 `screenToWorld`, 无调用的 `worldToScreen` 建议删除。

### 1.4 `pusher.ts`(64 行)
- **A 级(已知缺陷): 单例 + `auth.params.boardId` 固化**(`pusher.ts:11-20`)。`initPusher(key, cluster, boardId)` 只在首次调用时生效,切换背景板后 auth 参数陈旧,导致订阅失败(实测板 B 鉴权 400)。修复是删除 `boardId` 参数 —— 服务端可从 `channel_name` 解析,前端传参纯属冗余,删掉还能简化 `board.tsx` loader 的传参。
- **B 级: 频道名/事件名跨端重复**。`"presence-board-"` 前缀与 `"board:patch"` 事件名在 `lib/pusher.ts:38,41` 与 `server/pusher.ts:6-10` 各写一份,没有共享来源。若日后改频道命名规则,两处必须同步改。可在 `lib/types.ts`(或新建 `lib/constants.ts`)导出,两端引用 —— 一行成本,消除一类隐性不一致。
- **C 级**: 模块级 `let pusher` 单例不利于测试,但本项目规模下可接受(重构单例引入的复杂度 > 收益)。

---

## 2. `app/server/` — 服务端层

### 2.1 `db.ts`(452 行)
- 分区注释(`// ---------- 便笺 ----------`)清晰,每个实体一段;行映射函数模式好。
- **A 级: 连线残留死代码**。`deleteBoard`(db.ts:150)与 `deleteNote`(db.ts:290-291)中仍操作 `links` 表,但连线功能已整体移除(路由/组件/类型已删)。这两条 SQL 属于"历史遗留",删除它,否则后人会以为 links 仍是活跃功能,且 schema 迁移文档难以对齐。
- **B 级: `moveNote` 的 SQL 三元拼接**(db.ts:281-283)。`${zIndex !== undefined ? "z_index = ?," : ""}` 可读性欠佳,且 `zIndex` 目前**没有任何调用方传入**(前端 commitMove 只传 x/y)—— 既然死参数,不如直接删掉 zIndex 分支,函数立即简化 1/3。
- **B 级: `createNote` 返回 `(await getNote(env, id))!`**(db.ts:248)。非空断言依赖"刚插入必存在"的假设,如果将来在 INSERT 与 SELECT 之间引入异步清理会静默出错。可接受,但至少加一行注释说明为何安全。
- **C 级**: `now()`/`newId()` 是 4 行包装,本可直接 `Date.now()`/`crypto.randomUUID()`,但统一入口便于将来换实现(如有序 ID),保留合理。
- **C 级**: `updateNote` 的动态 SET 拼接依赖类型白名单(`Partial<Pick<Note, ...>>`),运行时键名来自白名单,安全。此模式在只有一张表时无需抽象。

### 2.2 `auth.ts`(85 行)+ `oauth.ts`(139 行)
- 职责清晰:auth 管会话,oauth 管 Google 流程,无交叉。
- **B 级: 两处 COOKIE_BASE 重复**(auth.ts:7-12 与 oauth.ts:34-45,连 `secure: false` 这个已知问题都重复了两遍)。改 secure 标志时容易只改一处。可共享一个 `cookieBase` 常量,顺便统一。
- **C 级**: `base64UrlEncode` 手写(oauth.ts:21-26)在 Node/Workers 都有标准库可借,但当前实现 5 行、无 bug,为省一个依赖而重构不值得 —— 维持现状。

### 2.3 `pusher.ts`(67 行,服务端)
- 纯 fetch 实现 + 详尽签名注释(`server/pusher.ts:24-26` 解释了 body_md5 的坑),**可读性优秀**。
- **B 级(同 1.4)**: `boardChannel`/`PATCH_EVENT` 与客户端重复,建议共享常量。
- **C 级**: `triggerPusher` 失败抛错由 `broadcastPatch` 的 `console.error` 吞掉,业务不中断 —— 这是**有意为之的降级策略**(实时失败不影响落库),注释里写明了,可接受。

### 2.4 `permissions.ts`(31 行)
- 最健康的文件之一。`assertMember`/`assertEditor` 职责分明,错误信息区分了"非成员"与"观看者无权限"。
- **C 级**: 两函数各查一次 DB,`api/notes.tsx:30` 在调用 `assertEditor` 前还先查了一次 `getBoardDetail`(三次查询)。本项目规模下可接受;若在意,可在 API 层删掉前置 `getBoardDetail`,让 assert 返回 role 复用。

---

## 3. 页面路由

### 3.1 `board.tsx`(507 行)—— 本文件问题最多

**职责混载**: 一个文件里同时存在 loader / action / 手势状态机(平移+捏合+滚轮)/ 画布渲染 / 邀请面板 / 成员头像 / toast / 两个 ConfirmDialog 的草稿状态。507 行对这个规模的项目尚可容忍,**但以下问题必须先处理**:

- **A 级: `action` 是死代码,且与 API 层重复**(board.tsx:42-77)。它内联 SQL 创建便笺(z_index 硬编码 0、不广播、`crypto.randomUUID()` 而非 `newId()`),而前端从未调用它(创建走 `/api/notes`)。这是"同一操作两条实现"的最坏形态:后人改 API 层时不会想到页面里还藏着一份 SQL。**直接删除整个 action**,路由文件立即瘦身 35 行。
- **A 级: 成员头像 `key={i}`**(board.tsx:360,370)。成员增删时 React 按索引复用 DOM,头像错位闪烁。改为 `key={m.id}`(或 `key={m.name}`),一行修复。
- **A 级(同 1.3): 坐标换算手写三处**。`board.tsx:145`(`(e.clientX - vp.viewX) / vp.scale`)、`board.tsx:174` 附近的手写换算、`NoteCard.tsx` 两处 —— 全部应改用 `screenToWorld`/`worldToScreen`。
- **B 级: 手势状态机与 UI 同组件**。`pointersRef/panRef/pinchRef` 三个 ref + 四个 handler + reset 兜底(约 90 行)逻辑上是一个独立单元,可抽 `useCanvasGestures(containerRef, { onPan, onZoomAt })` hook。**但在项目当前阶段这只是 B 级**:手势逻辑与画布渲染强耦合,拆分需引入回调接口,收益主要在"单独测试"——而本项目暂无测试。可等手势再复杂化或引入测试时再拆。
- **B 级: 组件内局部状态过多**(9 个 useState + 3 个 ref),邀请面板是完整的表单却内联在 JSX 中。可抽 `<InvitePanel>`,但同属"可做可不做"。
- **C 级**: 其余命名(handlePointerDown/resetGestures/commitMove)与注释(手势状态机为何要兜底清理)质量高,不动。

### 3.2 `note.tsx`(558 行)—— 重构后改善明显,但仍有膨胀

- TipTap 重构后代码组织比 textarea 时代清晰:模板常量区 / 注解工具区 / 编辑器初始化 / BubbleMenu 分块明确。
- **B 级: 模板常量与编辑器状态在同一文件**(note.tsx:43-79 的 4 组模板数组约 40 行)。这些是纯数据,与组件无关,可移到 `lib/`(如 `lib/templates.ts`)—— 好处是 NoteCard 或未来卡片快捷插入可复用。当前只有一处使用,优先级不高。
- **B 级: `save` 逻辑(防抖 + 状态机)内联在组件里**(note.tsx:97-114)。保存竞态(并发 PATCH 乱序)修复时必然要加"请求序号"状态,届时这个函数会变复杂,**建议届时再抽 `useDebouncedSave` hook**,现在先不加 —— 避免为尚不存在的复杂度提前抽象。
- **B 级: 保存失败静默置"已保存"**(note.tsx:104)—— 这是功能缺陷而非纯质量问题,但修复点就在这一行,顺手把状态改为 `"error"` 分支。
- **C 级**: `MOODS/WEATHERS` 与画布 NoteCard 已无重复(旧的 emoji 角标已删),跨文件重复问题已自然消失。
- **C 级**: 558 行对一个"编辑器页面"是可接受的;`useEditor` 配置、模板渲染、上传逻辑相互独立,硬拆反而增加跨文件跳转成本。

### 3.3 `home.tsx`(429 行)

- **B 级: 数据获取方式不一致**。`loadInbox`(home.tsx:144-157)用原生 `fetch` + 手写类型断言,而其余 API 调用统一走 `jsonApi`。应改用 `jsonApi<{ invitations: Invitation[] }>("/api/invitations/inbox")` —— 消除一类不一致,还能免费获得统一错误处理。
- **B 级: 类型体操** `NonNullable<Route.ComponentProps["loaderData"]["user"]>`(home.tsx:113)。建议提取 `type LoadedUser = NonNullable<Route.ComponentProps["loaderData"]["user"]>` 别名(或让 loader 返回类型显式),比每次展开表达式可读。
- **C 级**: LoginGate / GoogleIcon / BoardsView 拆分为文件内组件,合理。429 行含登录门 + 列表 + 账户菜单 + 收件箱 + 删除确认,在"首页"这个单体页面内可接受。
- 亮点: `formatTime` 抽成纯函数、`deleteBoardDraft` 非阻塞确认、`handleInvitation` 的错误兜底 —— 模式良好。

### 3.4 `auth.*.tsx`(三个文件,共 ~60 行)
- 各自职责单一(发起/回调/登出),无问题。`auth.callback.tsx:31` 的 `redirect(oauth.returnTo)` 是安全问题(见 CRITIC S2),非质量问题的范畴,不在此展开。

---

## 4. API 路由(一组,`app/routes/api/*`)

这一组 12 个文件**结构高度同质**(loader/action + 方法检查 + 权限守卫 + JSON 响应),单体都小于 80 行、可读性尚可,但作为一组看有三个横切问题:

- **A 级: 错误响应样板重复 20+ 次**。每个文件都有
  `new Response(JSON.stringify({ ok:false, error:{ code, message } }), { status, headers: { "Content-Type": "application/json" } })`。
  提取 `apiError()` 后,每个错误分支从 3 行变 1 行,且 `Content-Type` 头再也不会写漏。这是本项目**性价比最高的重构**(改 1 个文件 + 机械替换 12 个文件,肉眼可见的瘦身)。
- **B 级: 方法检查模式重复**。`if (request.method !== "POST") return 405` 在 8 个文件中重复。若项目继续增长(方法数×路由数),可抽 `requireMethod(request, "POST")`;当前 8 处重复可接受,不必急。
- **B 级: 校验与权限查询冗余**。`api/notes.tsx:30-37` 先 `getBoardDetail` 判 404 又 `assertEditor` 判 403(两次 DB 查询);`api/invitations.tsx` 里 `getBoardRole` + `getBoardDetail` 双查。小项目可接受,但既然 `assertEditor` 返回 role,让 API 层"查一次、两用"会更顺。
- **C 级**: 每个文件只暴露 `action`(无 loader)是 React Router 的合法用法,不算问题;`api/user.tsx` 把 `unauthorized()` 提到函数是好的局部优化。
- 注: 所有 API 文件命名(`note.tsx` vs `notes.tsx` 单复数区分资源与集合)是良好约定。

---

## 5. 组件层

### 5.1 `NoteCard.tsx`(155 行)
- **质量较高**。`memo` 化、`NOTE_WIDTH/HEIGHT` 常量、删除确认上提父组件(`onRequestDelete`)、手势注释解释 preventDefault 陷阱 —— 都是对的。
- **B 级: 手势回调内联注册**。`handleBodyDown` 内部用 `noteEl.addEventListener("pointermove"/"pointerup")` 手工注册/清理(NoteCard.tsx:85-108),清理逻辑散落在 `onUp` 闭包里。逻辑本身正确(有 `hasPointerCapture` 保护),但这是最容易漏监听器的模式 —— 若未清理会导致幽灵拖动。可考虑封装,但当前实现有注释说明且工作正常,**在无 bug 的情况下不强制重构**。
- **C 级**: `note.width` 字段已无消费者(卡片固定 240px),属于数据层残留(见 CRITIC),非组件问题。

### 5.2 `Markdown.tsx`(185 行)
- BlockView/Inline/Annotation 三层拆分清晰,rough-notation 的 `useEffect` 依赖数组(依赖 textKey 触发重绘)设计正确。
- **B 级: `ANNOTATION_STYLE` 的归属**。样式表定义在展示组件(Markdown.tsx:13-24),却被编辑器侧的 `annotationRenderer.ts:5` 和 `AnnotationIcon.tsx`(ICON_COLOR)引用 —— **依赖方向倒置**(编辑器依赖展示组件的内部常量)。移到 `lib/markdown.ts`(与 `AnnotationType` 同居)更合理,两行改动。
- **C 级**: 行内 token 用 `key={i}`(Markdown.tsx:95)在纯渲染列表中是安全用法,不视为问题。

### 5.3 编辑器三件套(`annotationMark.ts` 99 行 / `annotationRenderer.ts` 83 行 / `AnnotationIcon.tsx` 82 行)
- 职责切分正确:mark(模型/命令)、renderer(编辑器 overlay 管线)、icon(工具栏图标)。注释解释了 ProseMirror DOM 更新时序与 overlay 解耦的因果,质量高。
- **A 级: `seedOf` 重复实现**(annotationRenderer.ts:14-18 与 AnnotationIcon.tsx:17-21)——两处算法还不一致(一个 `*31 % 2147483647`,一个累加)。seed 是渲染稳定性依赖(避免形状抖动),两处不同算法意味着"相同的输入在不同的组件里画出不同的形状",纯属历史漂移。合并为一个共享函数,放 `lib/markdown.ts` 或 renderer 文件导出。
- **B 级: `ANNOTATION_STYLE` 与 `ICON_COLOR` 双色表**(Markdown.tsx 与 AnnotationIcon.tsx:7-15)。注释说明了分离意图(工具栏深底用浅色),合理,但两份表 + 三处 `strokeWidth` 特判(highlight 7px)容易在加新注解类型时漏改一处。加注解类型时检查清单应包含"三处样式表"。
- **C 级**: `annotationMark.ts` 的 `declare module "@tiptap/core"` augmentation 是 TipTap 官方推荐做法,不算 hack。

### 5.4 `ConfirmDialog.tsx`(45 行)
- 新组件,模式正确(非阻塞、fixed 定位、danger 变体)。无问题。已被 board/home 复用 —— 说明"先有需求再抽组件"的时机把握得好,未过度抽象。

---

## 6. 入口与配置

### 6.1 `root.tsx`(89 行)+ `entry.server.tsx`(38 行)+ `workers/app.ts`(23 行)
- 三者都短小、职责唯一。`root.tsx` 的字体 `dangerouslySetInnerHTML` 注入有注释解释为何(相对路径 404 坑),可接受。
- **C 级**: `entry.server.tsx` 中 `isbot` 判断 + `allReady` 的用法是 React Router 模板标准,无需改动。

### 6.2 `app.css`(240 行)
- `@layer base / components` 分层 + 分区注释,在 Tailwind v4 下手工维护 240 行是合理的。含 tiptap 行块视觉与 react-colorful 覆盖,均注明用途。
- **C 级**: `bg-board/note/warm` 主题色定义集中(见 `@theme`),无魔法值散落,无需改动。

### 6.3 `vite.config.ts` / `wrangler.jsonc` / `package.json`
- `vite.config.ts` 的 `optimizeDeps.include` 是踩坑后手工维护的清单(CHANGELOG 有记录),**有注释价值但无注释** —— 建议补一行"此清单来自 cloudflare 插件 SSR 依赖预打包坑"。
- `wrangler.jsonc` 的 `compatibility_date: "2026-07-01"` 超出运行时支持被静默回退到 `2025-11-25`(dev 日志可见)—— 配置与实际行为不一致,是质量问题而非功能问题,应改为受支持的日期。
- **A 级: package.json 未用依赖**。`react-markdown`、`remark-gfm`(被自研 Markdown.tsx 替代)、`clsx`、`lucide-react` 均无任何引用,应从 dependencies 移除(以及 vite.config.ts 的 include 清单中对应项)。死依赖会误导后人以为项目在用它们。
> **批注 (2026-08-05 复核)**: 该断言不准确 — `react-markdown` / `remark-gfm` 并不在 package.json dependencies 中(已核验依赖清单), 它们只残留在 `vite.config.ts` 的 `optimizeDeps.include`(dev 日志有 "Failed to resolve dependency" 警告)。正确清理目标: vite.config.ts 的 include 清单; package.json 侧的死依赖只有 `clsx` / `lucide-react`。

---

## 7. 横切问题汇总(跨文件)

| # | 问题 | 涉及位置 | 级别 | 建议 |
| --- | --- | --- | --- | --- |
| X1 | 错误响应样板重复 | 12 个 API 文件 ~20 处 | A | 提取 `apiError()` 到 `lib/api.ts`(服务端侧) |
| X2 | 坐标换算手写 | board.tsx:145,174 / NoteCard.tsx:77-78 | A | 统一用 `store.screenToWorld` |
| X3 | 频道名/事件名跨端重复 | lib/pusher.ts:38,41 / server/pusher.ts:6-10 | B | 共享常量 |
| X4 | `seedOf` 双实现且算法不同 | annotationRenderer.ts:14 / AnnotationIcon.tsx:17 | A | 合并为一个函数 |
| X5 | `ANNOTATION_STYLE` 依赖倒置 | Markdown.tsx:13 / annotationRenderer.ts:5 | B | 移到 `lib/markdown.ts` |
| X6 | `store.members` 死状态 | store.ts:25,120 / board.tsx:146-151 | A | 删除或改读 |
| X7 | links 死代码 | db.ts:150,290-291 / package.json 死依赖 | A | 清理 SQL 与依赖 |
> **批注 (2026-08-05 复核)**: 建议不完整 — `links` 表仍存在于 schema (migrations/0001) 且从未迁移删除; 仅删 SQL 会让 deleteBoard/deleteNote 遗留孤儿 links 行。完整方案: 新增迁移 `DROP TABLE links` + 删除 db.ts 两处 SQL, 一并处理。另外 package.json 侧死依赖仅 `clsx` / `lucide-react`(react-markdown/remark-gfm 只残留在 vite.config include, 见 §6.3 批注)。
| X8 | `board.tsx` action 死代码 | board.tsx:42-77 | A | 删除 |
| X9 | 头像 `key={i}` | board.tsx:360,370 | A | 用 `m.id` |

---

## 8. 结论:这个阶段"应该做"与"不要做"

**应该做(一个下午可完成,显著提升可读性):**
1. 清理死代码:删 `board.tsx` action、删 links SQL、删未用依赖、删 `store.members`;
2. 提取 `apiError()` 帮助函数并替换 12 个 API 文件;
3. 统一坐标换算调用 `screenToWorld`;
4. 合并 `seedOf`、移动 `ANNOTATION_STYLE`;
5. 修 `key={i}`。

**可做可不做(等需求驱动,不提前抽象):**
- `useCanvasGestures` / `useDebouncedSave` hook 抽取 —— 等手势或保存逻辑再次变复杂、或引入测试时再做;
- 邀请面板抽组件、模板常量移 `lib/` —— 等出现第二个使用方;
- Repository / 服务层抽象 —— **本项目严禁**。D1 直连 + 路由内 action 在千行规模下就是正确的架构。

**不要做(过度工程红线):**
- 不引入 zod 校验层(当前手写 typeof 检查已够,CRITIC 中的校验缺陷是"漏校验"而非"缺框架");
- 不引入状态管理库之外的重型抽象(zustand 已足够);
- 不做分层架构(controller/service/repository 分层在 20 文件规模下是负担);
- 不为 558 行的 note.tsx 强行拆组件 —— 编辑器页面的线性可读性优于跨文件跳转。

> 一句话总结: 代码的"骨架"与"命名"是健康的,问题集中在**遗留(dead code)与重复(boilerplate)**上 —— 而这两类问题恰好是清理成本最低、收益最立竿见影的。清理完毕后,本项目的可维护性在这个规模上可以打 A。

---

*评审完成时间: 2026-08-05。基线 4b93606。*
