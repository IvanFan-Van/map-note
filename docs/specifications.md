# map-note 共享便笺项目 · 规格说明书 (Specifications)

> **历史文档**: 本文档描述已废弃的"共享便笺"产品 (背景板/便笺/画布), 当前产品为地图探索帖子平台, 以 README 与代码为准。

> 版本: v1.1 (2026-08-04)
> 状态: 开发蓝图, 指导整个项目的实现
> 项目性质: 多人共享、实时同步、无限画布式生活记录便笺

---

## 1. 项目概述

### 1.1 愿景

map-note 是一款"自由钉在无限桌面上的共享便笺"。用户打开页面后看到的是一块无限大小的背景板(下文统一称 **背景板**), 可以在任意位置"钉"上便笺, 与受邀的好友共同编辑、实时同步, 用于记录生活点滴。

### 1.2 核心概念

| 术语 | 含义 |
| --- | --- |
| 背景板 (Board) | 无限大小、可平移缩放的 2D 画布, 是一块"桌面背景板" |
| 便笺 (Note) | 钉在背景板上的简洁矩形卡片, 内含 Markdown 内容与快捷状态(心情/天气/疲惫/进食) |
| 用户 (User) | 通过 Google 账号登录, 拥有唯一用户 ID, 通过 ID 邀请他人 |
| 收件箱 (Inbox) | 收到邀请后待处理的列表, 接受后进入对方背景板 |
| 权限 (Role) | `editor` 编辑者 / `viewer` 观看者 |

### 1.3 目标平台

- 桌面端: 鼠标 + 键盘 (Ctrl+滚轮缩放、按住拖拽平移)
- 移动端: 触屏 (双指捏合缩放、单指拖拽平移)
- 现代浏览器 (Chrome / Edge / Safari / Firefox), 不支持 IE

---

## 2. 技术栈

### 2.1 基础架构

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | React 19 + React Router v8 (Framework Mode, SSR) | 项目已初始化 (vite + `@react-router/dev`) |
| 样式 | Tailwind CSS v4 (`@tailwindcss/vite`) | 已集成; 自定纸张质感通过 CSS 实现 |
| 运行时/部署 | Cloudflare Workers (通过 `@cloudflare/vite-plugin`) | SSR 在 Workers 运行时执行 |
| 数据库 | Cloudflare D1 (SQLite) | 全部业务数据 |
| 图片存储 | Cloudflare R2 | 便笺插入的图片对象 |
| 实时同步 | Pusher Channels (免费版) | 每块背景板一个 presence 频道, 服务端触发增量变更; 移除对 DO 的依赖 |
| 会话 | Google OAuth 2.0 (Authorization Code + PKCE) | 登录后签发 HMAC 签名会话 Cookie |

### 2.2 第三方库清单

#### 运行时依赖 (dependencies)

| 库 | 用途 | 备注 |
| --- | --- | --- |
| `rough-notation` | 文本注解绘制 (下划线/方框/圆圈/高亮/删除线/划掉/括号, 支持多行) | 选中文本工具栏样式, 客户端绘制 |
| `zustand` | 客户端全局状态 (画布变换、便笺列表、实时合并) | 轻量, 便于 Pusher 事件直接写入 store |
| `clsx` | 条件 class 合并 | 便利工具 |
| `lucide-react` | 图标库 (编辑工具栏、心情/天气图标等) | 简约线性图标, 风格契合 |
| `pusher` | 服务端: 写操作成功后触发频道事件 (Pusher REST API) | 服务端触发不占客户端连接数 |
| `pusher-js` | 客户端: 订阅背景板 presence 频道、接收增量变更 | 自带成员在线事件 |
| Google Fonts: Patrick Hand | 英文字体 | `https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap` |
| 本地字体: LeMiXiaoNaiPaoTi | 中文字体 | `assets/LeMiXiaoNaiPaoTi.TTF` (已存在) |

说明: 无限画布、拖拽、捏合手势均 **自研实现**(原生 Pointer Events + CSS transform), 不引入重画布库, 保持代码可控与体积小巧。

#### 开发依赖 (devDependencies)

| 库 | 用途 |
| --- | --- |
| `wrangler` | Cloudflare 本地开发 (`wrangler dev`)、D1 迁移、部署 |
| `@cloudflare/vite-plugin` | Vite + Workers 运行时集成 (替换默认 Node SSR) |
| `@cloudflare/workers-types` | Workers 环境 TS 类型 (Env / D1Database / R2Bucket) |

#### 明确不使用的库

| 库 | 原因 |
| --- | --- |
| 重型画布库 (konva/fabric/react-flow) | 需求简单, 自研更轻 |
| DnD 库 (@dnd-kit/react-rnd) | 自研 Pointer Events 可精确控制蓝色 mask 预览 |
| Markdown 富文本编辑器 (@uiw/react-md-editor) | 用 textarea + 工具栏插入语法, 更简约可控 |
| 后端框架 (Hono/Express) | React Router 的 loader/action 已满足 |

---

## 3. 架构总览

### 3.1 Cloudflare 资源

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare Workers                 │
│  main: ./workers/app.ts (React Router SSR handler)  │
│  ┌────────────┐ ┌────────────┐  ┌─────────────────┐ │
│  │ D1: DB     │ │ R2: IMAGES │  │ Pusher (外部)   │ │
│  │ 业务数据    │ │ 便笺图片    │  │ 实时广播通道     │ │
│  └────────────┘ └────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────┘
```

| 绑定 / 凭据 | 资源 | 用途 |
| --- | --- | --- |
| `DB` | D1 数据库 `map-note` | 所有结构化数据 (users/boards/notes/links/...) |
| `IMAGES` | R2 Bucket `map-note-images` | 图片对象, key 不可猜测 (uuid), 通过 worker 路由读取 |
| `SECRET_KEY` | Worker Secret | 会话 cookie HMAC 签名密钥 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Worker Secret | Google OAuth 客户端凭据 |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` | Worker Secret | Pusher 应用凭据 (服务端触发 + 客户端连接) |

### 3.2 数据流

**写入路径 (持久化 + 广播):**

```
客户端操作 ──▶ REST (loader/action, D1 写入) ──▶ 返回结果
                        │
                        └─▶ Pusher REST API (trigger) ──▶ 推送给订阅该板频道的其他客户端
```

- 所有写操作走 HTTP (D1 直接写库, 可审计、可靠、可重试);
- 写成功后调用 Pusher 服务端 API, 向 `presence-board-{boardId}` 频道触发 `board:patch` 事件;
- Pusher 仅承担实时通知, **不承载业务数据**; 数据唯一来源始终是 D1。

**读取路径:** 进入背景板页面时 loader 一次性拉取全量数据 (board + notes + links + members), 之后依赖 Pusher 增量事件合并。

### 3.3 目录结构规划 (目标)

```
├── app/
│   ├── root.tsx                 # 根布局: 字体 links、全局 Provider
│   ├── routes.ts                # 路由表
│   ├── routes/
│   │   ├── home.tsx             # 首页: 登录引导/背景板选择 + 用户菜单 + 收件箱
│   │   ├── auth.login.tsx       # GET: 302 跳转 Google OAuth
│   │   ├── auth.callback.tsx    # GET: OAuth 回调 (换 token, 建/取用户, 发会话 Cookie)
│   │   ├── auth.logout.tsx      # POST: 登出
│   │   ├── board.tsx            # 背景板页 (无限画布)
│   │   ├── note.tsx             # 便笺编辑页
│   │   └── api/                 # REST API 路由 (loader/action)
│   │       ├── user.ts
│   │       ├── pusher-auth.ts   # Pusher 频道订阅鉴权
│   │       ├── boards.ts
│   │       ├── board.ts
│   │       ├── invitations.ts
│   │       ├── notes.ts
│   │       ├── links.ts
│   │       └── images.ts
│   ├── components/
│   │   ├── board/               # BoardCanvas / NoteCard / Pin / LinkLine / DragPreview
│   │   ├── editor/              # NoteEditor / MarkdownToolbar / MoodPicker / WeatherPicker
│   │   └── ui/                  # 通用小组件
│   ├── lib/
│   │   ├── api.ts               # fetch 封装 (统一 JSON 错误处理)
│   │   ├── pusher.ts            # pusher-js 客户端 (订阅/事件分发/重连补齐)
│   │   ├── store.ts             # zustand store
│   │   ├── markdown.ts          # 图片提取/渲染工具
│   │   └── types.ts             # 共享 TS 类型 (与 D1 行一一对应)
│   └── server/
│       ├── db.ts                # D1 访问封装 (prepared statements)
│       ├── auth.ts              # 会话 cookie 签发/校验
│       ├── oauth.ts             # Google OAuth (PKCE) 流程
│       ├── pusher.ts            # Pusher 服务端实例与触发封装
│       └── permissions.ts       # 权限校验
├── workers/
│   └── app.ts                   # Worker 入口 (SSR handler)
├── migrations/                  # D1 SQL 迁移文件 (0001_init.sql, ...)
├── wrangler.jsonc               # Workers 配置与绑定
└── docs/specifications.md       # 本文档
```

---

## 4. 数据模型 (D1 Schema)

所有时间戳使用 **Unix 毫秒整数 (INTEGER)**; ID 使用 `nanoid` 风格或 `crypto.randomUUID()` (TEXT, 默认客户端/服务端生成)。

### 4.1 表结构

#### `users` — 用户

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 用户唯一 ID (内部 uuid, 分享给他人用于邀请) |
| google_sub | TEXT | NOT NULL UNIQUE | Google 账号唯一标识 (OAuth 绑定, 登录凭据) |
| email | TEXT | NOT NULL | Google 邮箱 |
| name | TEXT | NOT NULL | 昵称 (默认取 Google 昵称, 可改) |
| avatar_url | TEXT | NULL | Google 头像地址 |
| created_at | INTEGER | NOT NULL | 创建时间 |

#### `boards` — 背景板

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 背景板 ID |
| owner_id | TEXT | NOT NULL → users.id | 创建者 (自动成为 editor) |
| name | TEXT | NOT NULL | 名称, 默认 "我的生活" |
| created_at | INTEGER | NOT NULL | 创建时间 |

#### `board_members` — 背景板成员与权限

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| board_id | TEXT | PK(复合) → boards.id | 背景板 |
| user_id | TEXT | PK(复合) → users.id | 用户 |
| role | TEXT | CHECK IN ('editor','viewer') | 权限 |
| created_at | INTEGER | NOT NULL | 加入时间 |

#### `invitations` — 邀请

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 邀请 ID |
| board_id | TEXT | NOT NULL → boards.id | 目标背景板 |
| inviter_id | TEXT | NOT NULL → users.id | 发起者 |
| invitee_id | TEXT | NOT NULL → users.id | 被邀请者 |
| role | TEXT | CHECK IN ('editor','viewer') | 授予权限 |
| status | TEXT | DEFAULT 'pending', CHECK IN ('pending','accepted','declined') | 状态 |
| created_at | INTEGER | NOT NULL | 创建时间 |
| updated_at | INTEGER | NOT NULL | 处理时间 |

#### `notes` — 便笺

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 便笺 ID |
| board_id | TEXT | NOT NULL → boards.id | 所属背景板 |
| author_id | TEXT | NOT NULL → users.id | 作者 |
| content | TEXT | NOT NULL DEFAULT '' | Markdown 内容 |
| pos_x | REAL | NOT NULL DEFAULT 0 | 世界坐标 X (单位 px) |
| pos_y | REAL | NOT NULL DEFAULT 0 | 世界坐标 Y (单位 px) |
| z_index | INTEGER | NOT NULL DEFAULT 0 | 层叠顺序 |
| width | INTEGER | NOT NULL DEFAULT 260 | 便笺宽度 |
| mood | TEXT | NULL | 心情 (枚举见 7.4) |
| weather | TEXT | NULL | 天气 (枚举见 7.4) |
| fatigue | INTEGER | NULL, CHECK 0-10 | 疲惫程度 0~10 |
| diet | TEXT | NULL | 进食记录文本 (自由输入) |
| created_at | INTEGER | NOT NULL | 创建时间 |
| updated_at | INTEGER | NOT NULL | 最近修改时间 |

#### `links` — 便笺连线 (已弃用, 保留表结构)

> 连线功能已于 2026-08-04 移除, 该表不再读写。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | PK | 连线 ID |
| board_id | TEXT | NOT NULL → boards.id | 所属背景板 |
| from_note_id | TEXT | NOT NULL → notes.id | 起点便笺 (大头钉) |
| to_note_id | TEXT | NOT NULL → notes.id | 终点便笺 (大头钉) |
| color | TEXT | NOT NULL DEFAULT '#e11d48' | 颜色 (十六进制), 默认红色 |
| thickness | REAL | NOT NULL DEFAULT 2 | 线粗细 (px) |
| created_at | INTEGER | NOT NULL | 创建时间 |

#### `user_settings` — 用户设置

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| user_id | TEXT | PK → users.id | 用户 |
| default_board_id | TEXT | NULL → boards.id | 打开页面默认进入的背景板 |
| updated_at | INTEGER | NOT NULL | 更新时间 |

### 4.2 索引

```sql
CREATE INDEX idx_members_user ON board_members(user_id);
CREATE INDEX idx_notes_board ON notes(board_id);
CREATE INDEX idx_links_board ON links(board_id);
CREATE INDEX idx_invites_invitee ON invitations(invitee_id, status);
```

### 4.3 迁移策略

- 使用 wrangler 官方迁移: `migrations/0001_init.sql` 等, 通过 `wrangler d1 migrations apply map-note --local/--remote` 执行;
- 本地开发用 `wrangler d1 migrations apply map-note --local` (miniflare 本地 SQLite);
- 每次 schema 变更新增一个递增迁移文件, 不修改已应用的文件。

---

## 5. 身份与会话

**设计:** Google OAuth 2.0 (Authorization Code + PKCE), 登录后由服务端签发签名会话 Cookie; 无密码、无额外注册。

### 5.1 前置配置 (Google Cloud Console)

1. 创建 OAuth Client ID (类型 **Web application**);
2. 授权重定向 URI: 生产 `https://<域名>/auth/callback`, 本地 `http://localhost:5173/auth/callback`;
3. 将 Client ID / Client Secret 写入 Worker Secrets (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) 与本地 `.dev.vars`。

### 5.2 登录流程 (PKCE)

1. `GET /auth/login`: 生成随机 `code_verifier` 与 `code_challenge` (SHA-256 → base64url), 将 `state` + `code_verifier` 存入短期签名 Cookie, 302 跳转:
   `https://accounts.google.com/o/oauth2/v2/auth?client_id&redirect_uri&response_type=code&scope=openid email profile&code_challenge&code_challenge_method=S256&state`;
2. `GET /auth/callback?code&state`: 校验 `state`, 用 `code` + `code_verifier` POST `https://oauth2.googleapis.com/token` 换取 access_token, 再携带它请求 `https://openidconnect.googleapis.com/v1/userinfo` 获得 `{ sub, email, name, picture }`;
3. 按 `google_sub` upsert `users` (首次登录创建用户), 签发会话 Cookie, 302 跳回 `/` (或登录前页面);
4. `POST /auth/logout` 清除会话 Cookie。

### 5.3 会话

- Cookie: `map_note_session = base64({userId, exp}) + "." + HMAC_SHA256(SECRET_KEY)`, 有效期 30 天;
- 各 loader/action 通过 `app/server/auth.ts` 的 `requireUser()` 校验签名与过期时间;
- 用户 ID 通过右上角账户菜单"复制我的 ID"分享, 对方用该 ID 发起邀请。

### 5.4 前端

- 未登录: 首页渲染"使用 Google 登录"按钮 (链接至 `/auth/login`);
- 已登录: 右上角显示 Google 头像 + 昵称 + 账户菜单。

---

## 6. 接口定义 (API)

### 6.1 通用约定

- 所有接口基于 React Router 的 `loader` / `action` 实现 (部署于 `/api/*` 路由);
- 请求/响应均为 JSON (图片上传除外, 为 multipart/form-data);
- 统一响应包裹: `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`; 错误 HTTP 状态码: 400 参数错误 / 401 未登录 / 403 无权限 / 404 不存在 / 409 冲突;
- 所有写接口均校验成员权限 (见 6.9); 订阅类接口 (Pusher 频道鉴权) 校验成员资格。

### 6.2 用户

#### `GET /api/user` — 获取当前用户

- 输入: 无 (会话 Cookie)
- 返回: `{ user: { id, name, email, avatarUrl }, settings: { defaultBoardId: string|null } }`
- 权限: 需登录 (未登录返回 401, 前端渲染 Google 登录按钮)
- 实现: 校验会话 Cookie, 查询 `users` + `user_settings`。

#### `PATCH /api/user` — 更新昵称

- 输入: `{ name: string }` (1~20 字符)
- 返回: `{ user: { id, name, email, avatarUrl } }`
- 实现: 更新 `users.name`。

### 6.3 背景板

#### `POST /api/boards` — 创建背景板

- 输入: `{ name?: string }` (默认 "我的生活")
- 返回: `{ board: { id, name, ownerId, role: 'editor' } }`
- 实现: 创建 `boards` 行 + 以 owner/editor 身份插入 `board_members`。

#### `GET /api/boards` — 我的背景板列表

- 输入: 无
- 返回: `{ boards: Array<{ id, name, ownerId, role, memberCount, noteCount, updatedAt }> }`
- 实现: 联表查询 `board_members` + 聚合。

#### `GET /api/boards/:id` — 进入背景板 (全量数据)

- 输入: 路径参数 `id`
- 返回:
```json
{
  "board": { "id": "...", "name": "...", "ownerId": "...", "role": "editor" },
  "notes": [{ "id", "authorId", "content", "posX", "posY", "zIndex", "width", "mood", "weather", "fatigue", "diet", "createdAt", "updatedAt" }],
  "links": [{ "id", "fromNoteId", "toNoteId", "color", "thickness" }]
}
```
- 权限: 必须是该板成员 (403)
- 实现: `notes` 按 board_id 查询, `links` 按 board_id 查询。

#### `POST /api/boards/:id/default` — 设为默认背景板

- 输入: 路径参数 `id`
- 返回: `{ ok: true }`
- 权限: 该板成员
- 实现: upsert `user_settings.default_board_id`。

### 6.4 邀请与收件箱

#### `POST /api/invitations` — 发起邀请

- 输入: `{ boardId, inviteeId, role: 'editor'|'viewer' }`
- 返回: `{ invitation: { id, boardId, inviterId, inviteeId, role, status } }`
- 权限: 发起者必须是该板 **editor**
- 实现: 校验 invitee 存在、尚未是该板成员、无 pending 重复邀请, 写入 `invitations` (status=pending)。

#### `GET /api/invitations/inbox` — 收件箱

- 输入: 无
- 返回:
```json
{ "invitations": [{
  "id", "boardId", "boardName", "inviterId", "inviterName", "role", "status", "createdAt"
}] }
```
- 实现: 查询 `invitee_id = 当前用户`, 联表取背景板名/邀请人名。

#### `POST /api/invitations/:id/accept` — 接受邀请

- 输入: 路径参数 `id`
- 返回: `{ board: { id, name, role } }`
- 权限: 仅被邀请者本人
- 实现: 校验 status=pending; 事务内更新 status=accepted 并插入 `board_members`。

#### `POST /api/invitations/:id/decline` — 拒绝邀请

- 输入: 路径参数 `id`
- 返回: `{ ok: true }`
- 实现: status=pending → declined。

### 6.5 便笺

#### `POST /api/notes` — 创建便笺

- 输入: `{ boardId, x: number, y: number, content?: string, width?: number }`
- 返回: `{ note: {...} }` (字段同 6.3 中的 note)
- 权限: 该板 **editor**
- 实现: 插入 notes, z_index = 当前板最大值+1; 成功后广播 patch。

#### `PATCH /api/notes/:id` — 更新内容与快捷状态

- 输入: `{ content?, mood?, weather?, fatigue?, diet? }` (全可选, 只更新提供字段)
- 返回: `{ note }`
- 权限: 该 note 所属板 **editor**
- 实现: 动态 UPDATE + `updated_at`; 成功后广播 patch。

#### `PUT /api/notes/:id/position` — 移动便笺

- 输入: `{ x: number, y: number, zIndex?: number }`
- 返回: `{ note }`
- 权限: 该板 **editor**
- 实现: 更新坐标与层叠; 成功后广播 patch。

#### `DELETE /api/notes/:id` — 删除便笺

- 输入: 路径参数
- 返回: `{ ok: true }`
- 权限: 该板 **editor**
- 实现: 事务内删除 note 及其关联 links; 成功后广播 patch。

### 6.6 ~~连线~~ — 已移除 (2026-08-04)

连线相关 API (`POST /api/links`, `PATCH/DELETE /api/links/:id`) 已随功能移除, 不再提供。

### 6.7 图片

#### `POST /api/images` — 上传图片

- 输入: multipart/form-data, 字段 `file` (图片, ≤ 5MB), 附加 `boardId`, `noteId`
- 返回: `{ image: { url: string, width: number, height: number } }`
- 权限: 该板 **editor**
- 实现:
  1. 校验类型 (png/jpg/webp/gif) 与大小;
  2. R2 上传, key = `boards/{boardId}/notes/{noteId}/{uuid}.{ext}`;
  3. 读取图片尺寸 (R2 `customMetadata`: `{ width, height }`);
  4. 返回可公开访问的 URL (见 `GET /images/:key`)。

#### `GET /images/:key` — 读取图片

- 输入: 路径参数 key
- 返回: 图片二进制流 (Content-Type 由对象元数据决定)
- 权限: 目标所在板成员; 非成员返回 403
- 实现: 从 key 解析 boardId → 校验成员 → R2 `get(key)` → 返回 body + `writeHttpMetadata`。 (注意: 编辑页内联 img 的加载需携带 Cookie, 同源即可。)

### 6.8 Pusher 实时通道

#### 频道设计

| 频道 | 类型 | 用途 |
| --- | --- | --- |
| `presence-board-{boardId}` | presence | 每块背景板一个; 广播便笺/连线变更, 自带在线成员事件 |

- presence 频道由 Pusher 托管 (`pusher:member_added` / `pusher:member_removed` 事件可用于顶部在线头像);
- **免费版 (Sandbox) 限额:** 100 并发连接 / 200K 条消息/天 / 100 个频道 — 家用与好友规模足够; 超出并发连接时新连接被拒, 前端需给出提示。

#### `POST /api/pusher/auth` — 频道订阅鉴权

- 输入: `x-www-form-urlencoded`: `socket_id`, `channel_name`, 附带 `boardId`
- 返回: `{ auth: string, channel_data: string }` (Pusher 订阅所需格式)
- 权限: 已登录 + 该板成员
- 实现: 校验成员资格后调用 `pusher.authorizeChannel(socketId, channel, { user_id, user_info: { name } })` (presence 频道要求 user_id)。

#### 事件协议 (事件名 `board:patch`)

服务端 → 客户端 (Pusher 推送, 只含增量):

```ts
type PatchEvent = {
  type: "patch";
  entity: "note" | "board";
  id: string;
  changes: Record<string, unknown>;
  updatedAt: number;
  sender: string;
};
```

- **发送时机:** 客户端完成写操作 (REST 成功) 后, 服务端 action 内调用 `pusher.trigger("presence-board-{boardId}", "board:patch", patch)` (服务端触发不计入客户端连接数);
- **合并规则:** 接收方按 `id` 浅合并 `changes`, `updatedAt` 较旧者忽略 (LWW);
- **可靠性:** Pusher 无离线消息; 连接断开重连后 (`pusher:connection_state_changed` 恢复) 重新调用 `GET /api/boards/:id` 全量拉取补齐;
- **在线成员:** presence 成员事件仅用于展示, 不参与业务数据。

### 6.9 权限矩阵

| 操作 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看背景板 / 数据 | ✔ | ✔ | ✔ |
| 创建/编辑/移动/删除便笺 | ✔ | ✔ | ✘ |
| 上传图片 | ✔ | ✔ | ✘ |
| 发起邀请 | ✔ | ✔ | ✘ |
| 重命名背景板 / 移除成员 | ✔ | ✘ | ✘ |
| 订阅 Pusher 频道 (实时) | ✔ | ✔ | ✔ |

---

## 7. 功能规格与实现计划

> 每条功能包含: 需求描述 / UI 表现 / 实现计划。编号 F1 起。

### F1 无限背景板 (缩放与平移)

**需求:** 背景板无限大小; 桌面端 Ctrl+滚轮缩放、按住拖拽平移; 移动端双指捏合缩放、单指拖拽平移。

**UI 表现:** 背景板为浅米色纸纹背景 (`#f7f3e8` 系), 网格微点纹理可选; 缩放范围 0.25×~4×; 缩放以光标所在位置为锚点。

**实现计划:**
- 状态: zustand store 保存视口 `{ viewX, viewY, scale }` (世界坐标 → 屏幕坐标换算函数 `worldToScreen` / `screenToWorld`);
- DOM: 全屏容器捕获指针事件; 内部 `world` 层 `style.transform = translate(viewX, viewY) scale(scale)`, 便笺与 SVG 连线层均置于 world 层内 (世界坐标定位, 随视口一起变换, 保证缩放时视觉同步);
- 桌面端: `onWheel` + `e.ctrlKey` → 以光标为锚缩放 (deltaY 映射 scale 乘数); 非 Ctrl 滚轮 → 平移;
- 移动端: Pointer Events 记录双指触点距离比 → 捏合缩放; 单指 → 平移; 容器 `touch-action: none` 禁用浏览器手势;
- 空白区域 pointerdown 启动平移 (设置 pointer capture), pointerup 结束。

### F2 便笺卡片 (极简矩形卡片)

**需求:** 背景板上的便笺为固定尺寸的简洁矩形卡片 (高而窄), 无钉子、无折角等装饰; 整体单色设计, 靠亮度差与阴影体现层次。

**UI 表现:** 固定 240×320px (宽×高); 单色浅暖白 `#fefcf5`, 1px 同色系描边 (`rgba(74,66,56,0.12)`), 双层柔和阴影 (`0 1px 2px` + `0 8px 24px`), hover 阴影加深; 内容超出裁剪; 底部固定快捷状态栏 (心情/天气/疲惫/进食), 以细分隔线区分。

**实现计划:**
- `NoteCard` 组件: 固定尺寸 (常量 `NOTE_WIDTH=240`, `NOTE_HEIGHT=320`), flex 纵向布局 — 缩略图堆叠 (若有) + 内容区 `flex-1 overflow-hidden` + 状态栏 `shrink-0`;
- 样式集中于 `app.css` 的 `.note-card` (无渐变、无伪元素装饰);
- 点击便笺主体 → 跳转编辑页 (F5); 拖拽主体 → 移动 (F4)。

### F3 便笺缩略图与堆叠

**需求:** 便笺内若有图片, 卡片上显示缩略图; 多张图片时显示堆叠样式 (可看出有多张)。

**UI 表现:** 卡片顶部区域显示图片缩略图条; 第 1 张完整显示, 第 2 张及之后每张向右下错位 6px 堆叠 (露出边缘), 堆叠底部阴影, 仿佛一叠照片。

**实现计划:**
- `markdown.ts` 提供 `extractImages(markdown): string[]` — 正则 `!\[([^\]]*)\]\(([^)\s]+)\)` 提取最多 3 张;
- `NoteCard` 渲染 `<ThumbnailStack images>`: 用绝对定位叠放 3 层 `<img>` (惰性加载 `loading="lazy"`), 层间 offset + 阴影; 图片加载失败显示占位图标;
- 与 markdown 渲染层分离, 便于实时 patch 后重算 (memo 化)。

### F4 便笺拖拽与选中状态 (无蓝色 mask)

**需求:** 拖拽便笺可移动 (本体直接跟随, 无蓝色 mask 预览); 单击便笺进入选中态 (蓝色边框), 再次点击已选中便笺进入编辑页, 点击空白取消选中。

**UI 表现:** 按下拖动 → 便笺半透明跟随指针移动, 松开提交位置 (PUT + 乐观更新); 单击 (未拖动) → 蓝色边框 (ring-2 ring-blue-500); 再击 → 跳转编辑页; 点击空白 → 取消选中。

**实现计划:**
- 手势: pointerdown 于 NoteCard → 进入 `dragNote` 状态 (store, 记录屏幕/世界坐标偏移), 便笺本体直接按预览位置渲染 (无独立 mask 组件);
- 单击判定: 松开时位移 < 5px → `onSelect(note)` — 由 board 决定选中或进入编辑 (依据 `selectedNoteId`);
- store 新增 `selectedNoteId` + `selectNote`; 画布空白 pointerdown → `selectNote(null)`。

### F5 便笺编辑器 (行块式 Markdown + 注解工具栏 + 模板插入)

**需求:** 编辑器占满窗口 (无独立预览面板); 行块式混合编辑 — 光标所在行显示 raw 文本, 其余行实时渲染; 支持标题/列表等语法; 选中文本弹出注解工具栏 (rough-notation); 心情/天气/疲惫/进食为模板字符串点击插入。

**UI 表现:**
- **行块编辑**: content 按行分块; 活动行 = 原生 textarea (raw), 非活动行 = 渲染块; 点击渲染块切回编辑 (光标行尾), 方向键上下切换行; 回车在光标处拆行并提交 (输入法组合期间不触发);
- **标题**: 输入 `# <title>` 回车后立即渲染为加粗大标题; 光标回到该行显示 raw;
- **列表**: `- item` / `1. item` 渲染为项目符号列表;
- **选中文本工具栏**: 选区非空时在选区上方弹出浮动工具栏, 包含 8 个工具 — 下划线 `^^`、方框 `[[`、圆圈 `((`、高亮 `==`、删除线 `~~`、划掉 `××`、括号 `⟦⟧`、多行开关 (三连标记变体, 如 `===text===`); 已应用样式按钮高亮 (蓝色激活态); 按设备宽度分页, 超出时最右侧显示翻页按钮;
- **模板插入**: 顶部快捷栏 (心情 5 项 / 天气 5 项 / 疲惫 5 档 / 进食), 点击在光标处插入模板 markdown (如 `**心情** 😊 开心`), 替代原独立字段 UI (DB 字段保留不再读写);
- 格式工具栏: 加粗/斜体/标题/列表/链接/图片 (作用于活动行)。

**实现计划:**
- `app/lib/markdown.ts`: 自研解析器 (行级: 标题/列表/引用/图片/段落; 行内: 加粗/斜体/代码/链接/图片/7 种注解标记), 无第三方依赖;
- `app/components/markdown/Markdown.tsx`: 渲染组件, 注解 span 在客户端用 rough-notation `annotate()` 绘制 (multiline 选项支持跨行);
- 浮动工具栏定位: mirror div 复制 textarea 样式计算选区坐标;
- 保存: 行变更重组 content → debounce PATCH (逻辑不变)。

### F6 ~~图钉连线 (Link)~~ — 已移除 (2026-08-04 决策)

**说明:** 应需求变更, 连线功能 (图钉拖拽连线、连线样式编辑) 已整体移除 — 删除前端连线层组件、连线 API 路由与数据层函数; `links` 表结构保留于迁移中但不再使用。

### F7 邀请、权限与收件箱

**需求:** 通过用户 ID 邀请他人进入背景板; 两种权限: 观看者 / 编辑者; 收件箱显示收到的邀请, 接受后可进入对方背景板。

**UI 表现:** 首页右上角账户菜单: 显示昵称/头像 + "我的 ID" (可复制); "邀请" 面板 (在背景板页): 输入对方用户 ID + 选择权限 → 发送; 收件箱面板: 邀请列表 (背景板名、邀请人、权限、时间) + 接受/拒绝按钮; 接受后背景板出现在我的列表。

**实现计划:**
- 邀请 API 见 6.4; 收件箱为首页抽屉/模态组件;
- 权限守卫: `app/server/permissions.ts` 提供 `assertEditor(boardId)` / `assertMember(boardId)`, 所有写接口调用; 前端按 `role` 隐藏编辑控件 (viewer 只读);
- 邀请成功提示 (toast): "已向 xxx 发送邀请"; 收件箱空态显示引导文案。

### F8 背景板选择与默认背景板

**需求:** 提供界面选择进入谁的背景板; 可设置每次打开页面默认进入某块背景板。

**UI 表现:** 首页为背景板卡片网格/列表: 每块显示名称、所有者、成员数、便笺数、最后活跃时间, 以及"设为默认"星标; 默认背景板在卡片角标标注。

**实现计划:**
- `GET /api/boards` + `POST /api/boards/:id/default` 见 6.3;
- 首页 loader 返回 boards + defaultBoardId; 若设置了默认板, 首页直接重定向到 `/b/:id` (可通过链接保留"查看全部"入口);
- 创建背景板按钮在首页显眼位置。

### F9 实时同步

**需求:** 同一背景板内所有编辑实时同步给所有成员 (便笺内容/位置/连线/状态)。

**UI 表现:** 无感知同步; 顶部可显示连接状态点 (绿=已连接, 灰=重连中); 他人拖拽便笺时其卡片随动 (以低频率广播位置预览, MVP: 仅广播最终位置)。

**实现计划:**
- 服务端: `app/server/pusher.ts` 封装 `Pusher` 实例; 所有写 action 成功后调用 `pusher.trigger("presence-board-{boardId}", "board:patch", patch)` (服务端触发不占客户端连接数, 消息量受免费版 200K/天限制);
- 客户端: `app/lib/pusher.ts` — 初始化 `pusher-js` (key/cluster 由环境注入), 进入背景板页订阅 `presence-board-{boardId}` (自动携带 cookie 调用 `POST /api/pusher/auth` 完成鉴权), 绑定 `board:patch` 合并进 zustand store; 监听 `pusher:connection_state_changed`, 恢复连接后重新调用 `GET /api/boards/:id` 全量拉取补齐;
- 写路径: 客户端操作 → REST action (D1 落库) → 服务端触发 Pusher 事件广播, 不依赖客户端连接状态;
- 在线成员: presence 事件维护成员列表, 顶部显示头像簇;
- 冲突策略: 以 `updatedAt` 为准 LWW; 同一 note 多人同时编辑时, 后写者覆盖 (MVP 可接受)。

---

## 8. 路由设计

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | home | 背景板选择列表 + 账户菜单 + 收件箱; 有默认板时自动跳转 |
| `/b/:boardId` | board | 背景板无限画布 (F1~F4, F6, F9) |
| `/b/:boardId/n/:noteId` | note | 便笺编辑页 (F5) |
| `/auth/login` | — | Google OAuth 发起 (302 跳转) |
| `/auth/callback` | — | Google OAuth 回调 (换取身份, 签发会话) |
| `/auth/logout` | — | 登出 |
| `/api/*` | — | REST 接口 (6.2~6.7) |
| `/api/pusher/auth` | — | Pusher 频道订阅鉴权 (6.8) |
| `/images/:key` | — | R2 图片代理 (6.7) |

`app/routes.ts` 配置 (文件路由或手写 route 均可, 实现时选定一种):

```ts
export default [
  index("routes/home.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),
  route("b/:boardId", "routes/board.tsx"),
  route("b/:boardId/n/:noteId", "routes/note.tsx"),
  // api 与 images 路由...
] satisfies RouteConfig;
```

根布局 `root.tsx` 引入字体 links (见第 9 节), 并注入全局样式。

---

## 9. 字体与视觉规范

### 9.1 字体配置

| 用途 | 字体 | 来源 |
| --- | --- | --- |
| 英文/数字 | **Patrick Hand** | Google Fonts CSS: `https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap` |
| 中文 | **LeMiXiaoNaiPaoTi** | 本地 `assets/LeMiXiaoNaiPaoTi.TTF` (项目根, 已存在) |

- 在 `app/root.tsx` 的 `links` 中注入 Google Fonts 预连接与样式表;
- 在全局 CSS (`app/app.css`) 声明本地字体:

```css
@font-face {
  font-family: "LeMiXiaoNaiPaoTi";
  src: url("../../assets/LeMiXiaoNaiPaoTi.TTF") format("truetype");
  font-display: swap;
}
```

(vite 会将相对路径 url() 解析打包; 若路径解析异常, 备选方案: `import fontUrl from "../../assets/LeMiXiaoNaiPaoTi.TTF?url"` 后以变量引用, 或将字体复制到 `public/assets/`。)

- 主题变量 (Tailwind `@theme`):

```css
@theme {
  --font-hand: "Patrick Hand", "LeMiXiaoNaiPaoTi", ui-rounded, sans-serif;
}
```

所有 UI (标题、便笺正文、按钮) 默认使用 `font-hand`; 中文自动落到 LeMiXiaoNaiPaoTi, 英文落到 Patrick Hand。

### 9.2 视觉风格 (简约风)

- 色彩: 背景板米纸色 `#f5f0e1`; 便笺单色浅暖白 `#fefcf5` (无渐变); 蓝色仅用于拖拽 mask (`#3b82f6`); 文字暖灰 `#4a4238`;
- 阴影: 便笺 `0 6px 18px rgba(120,100,60,.25)`, 图钉带投影; 圆角克制 (便笺 6px, 控件 10px);
- 动效: 过渡 150ms ease; 拖拽/缩放不引入动画, 保证跟手;
- 图标: lucide-react 细线条, 1.5px stroke。

---

## 10. 部署配置

### 10.1 wrangler.jsonc (项目根)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "map-note",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./build/client" },
  "observability": { "enabled": true },
  "d1_databases": [
    { "binding": "DB", "database_name": "map-note", "database_id": "<创建后填入>" }
  ],
  "r2_buckets": [
    { "binding": "IMAGES", "bucket_name": "map-note-images" }
  ]
}
```

### 10.2 vite.config.ts 调整

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), cloudflare()],
  resolve: { tsconfigPaths: true },
});
```

### 10.3 workers/app.ts (入口)

```ts
import { createRequestHandler } from "react-router";

declare global {
  interface CloudflareEnvironment extends Env {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
```

### 10.4 命令

```bash
pnpm dlx wrangler d1 create map-note              # 创建数据库 (填入 database_id)
pnpm dlx wrangler r2 bucket create map-note-images
pnpm dlx wrangler secret put SECRET_KEY          # 会话签名密钥
pnpm dlx wrangler secret put GOOGLE_CLIENT_ID    # Google OAuth Client ID
pnpm dlx wrangler secret put GOOGLE_CLIENT_SECRET
pnpm dlx wrangler secret put PUSHER_APP_ID       # Pusher 应用凭据 (dashboard.pusher.com)
pnpm dlx wrangler secret put PUSHER_KEY
pnpm dlx wrangler secret put PUSHER_SECRET
pnpm dlx wrangler secret put PUSHER_CLUSTER      # 如 ap1 / mt1 (与前端 key 配对)
pnpm dlx wrangler d1 migrations apply map-note --local   # 本地迁移
pnpm dlx wrangler d1 migrations apply map-note --remote  # 生产迁移
pnpm dev        # @cloudflare/vite-plugin 本地开发 (Workers 运行时 + 本地 D1/R2 模拟; Pusher 连云端)
pnpm run build && pnpm dlx wrangler deploy
```

(本地开发时 `GOOGLE_*` 与 `PUSHER_*` 也可放入项目根 `.dev.vars`, 由 wrangler 自动加载。)

### 10.5 环境说明

- React Router Framework 模式 + Cloudflare Vite 插件时 **SSR 在本地即 Workers 运行时**, D1/R2 绑定经 miniflare 本地模拟; 不建议同时使用 `react-router-serve` (Node) 作为本地开发;
- Pusher 本地开发直连云端免费额度即可 (`PUSHER_*` 写入 `.dev.vars`);
- D1 写入需要幂等/重试意识: 写操作如遇 5xx 由客户端重试, 冲突按 LWW;
- 图片代理 `GET /images/:key` 依赖会话 Cookie (同源), 无需额外 CORS 配置。

---

## 11. 开发里程碑

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| M1 脚手架 | CF 集成 (vite plugin / wrangler / workers/app.ts), D1 迁移初始化, Google OAuth 登录 (login/callback/logout), `GET/PATCH /api/user`, boards 基础 CRUD | Google 登录可用, 可创建/列出背景板 |
| M2 画布与便笺 | F1 无限画布 (缩放/平移), F2 便笺卡片视觉 (纸张/图钉/折角), F4 拖拽 + 蓝色 mask | 桌面端完整手势操作, 移动端双指缩放 |
| M3 编辑器 | F5 Markdown 编辑/预览 + 图片上传 (R2) + 心情/天气/疲惫/进食, F3 缩略图堆叠 | 便笺内可编辑与插入图片, 卡片显示堆叠缩略图 |
| M4 打磨画布 | 便笺卡片样式打磨 (极简单色设计) | 便笺 240×320 固定尺寸, 层次清晰 |
| M5 协作 | F7 邀请/收件箱/权限, F8 背景板选择与默认板 | 双账号互邀、viewer 只读生效 |
| M6 实时 | F9 Pusher 实时同步 (频道鉴权/事件广播/重连补齐) | 两浏览器同板内容/位置/连线实时互相同步 |
| M7 打磨 | 移动端手势完善、toast/空态/加载态、部署上线 | 全功能可在线上稳定使用 |

---

## 12. 风险与决策记录 (ADR)

| # | 决策 | 理由 | 备注 |
| --- | --- | --- | --- |
| 1 | 自研画布而非画布库 | 需求仅平移/缩放/拖拽, 自研可精确控制 mask 预览与手势细节 | 若后期需要多选/框选/复制粘贴, 再评估引入库 |
| 2 | 实时方案: 移除 DO, 采用 Pusher 免费版 | 避免 DO 计费与运维复杂度; 免费版 100 并发连接/200K 消息每天对家用足够; 保持 Workers 部署与 D1/R2 原生绑定 | 若超限或需离线消息, 升级 Pusher 付费或迁至自建实时服务 |
| 3 | Pusher 仅做通知, 不承载业务数据 | 数据唯一来源是 D1; 断线后可全量重拉补齐 | 无离线消息缓存, 依赖重连后全量同步 |
| 4 | 图片存 R2 而非 D1 | D1 单行/存储限制不适合二进制; URL 不可猜测 + 成员鉴权 | 删除便笺不删孤儿图片 (MVP), 后续可加 GC |
| 5 | Google OAuth 而非无密码 | 身份可信、免注册、自带头像与邮箱; ID 仍用于互相邀请 | 需在 Google Cloud Console 配置 OAuth Client; 会话 30 天 |
| 6 | LWW 冲突策略 | 两人同时编辑同一便笺时后写覆盖, 记录 updated_at | MVP 可接受; 若需协同文本, 引入 CRDT (如 yjs) 是可选升级路径 |
| 7 | 默认 SSO (SSR) | Framework 模式默认 SSR; Cloudflare 插件要求 SSR | 不使用 SPA 模式 |
| 8 | 移除连线功能, 便笺极简单色化 (2026-08-04) | 需求变更: 去掉钉子/折痕/连线装饰, 采用固定 240×320 单色浅暖白卡片, 以亮度差+阴影体现层次 | `links` 表保留不读; 如需恢复可依 git 历史回退 |

---

*本文档是开发的单一事实来源 (single source of truth)。实现过程中若需求变更, 请先更新本文档再改代码。*
