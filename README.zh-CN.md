# co-note · 共享便笺

一块无限桌面上的共享便笺板。在任意位置"钉"上便笺, 与受邀的好友实时协作编辑, 记录生活点滴。

## 功能

- **无限画布背景板** — 平移 / 缩放 / 双击空白处新建便笺 (非阻塞确认弹窗)
- **便笺卡片** (240×320 极简单色卡) — 拖拽移动, 双击进入编辑器
- **WYSIWYG 编辑器** (TipTap) — Markdown 语法仅在后台, 选中文本即可通过浮动工具栏应用 **rough 手绘注解** (方框 / 圆圈 / 下划线 / 高亮 / 删除线 / 划掉 / 括号 / 多行), 支持 per-annotation 颜色选择器
- **实时协作** (Pusher presence 频道) — 便笺的创建 / 移动 / 删除 / 编辑跨用户实时同步
- **Google OAuth 登录** (Authorization Code + PKCE)
- **背景板分享** — 按用户 ID 邀请协作者 (编辑者 / 观看者角色)
- **图片上传** — Markdown `![alt](url)` 图片存储于 Cloudflare R2

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, React Router v7 (SSR), Tailwind CSS v4 |
| 编辑器 | TipTap (ProseMirror) + rough-notation |
| 后端 | Cloudflare Workers (React Router 服务端构建) |
| 数据库 | Cloudflare D1 (SQLite) |
| 存储 | Cloudflare R2 (图片) |
| 实时 | Pusher (presence 频道, 自研 REST 触发) |
| 状态 | Zustand |
| 工具链 | TypeScript, ESLint (typescript-eslint), pnpm |

## 快速开始

### 前置要求

- Node.js ≥ 20 (pnpm 通过 Corepack: `corepack enable`)
- Cloudflare 账号 (本地 D1 模拟依赖 Wrangler)

### 安装依赖

```bash
pnpm install
```

### 环境变量

创建 `.env` 文件 (参考 `.env.example`)。所需键:

| 键 | 用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID (开发) |
| `CLOUDFLARE_DATABASE_ID` | 本地 D1 数据库 ID |
| `CLOUDFLARE_SERVICES_API_TOKEN` | Cloudflare API Token (部署) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 应用凭据 |
| `PUSHER_APP_ID` / `PUSHER_CLUSTER` / `PUSHER_KEY` / `PUSHER_SECRET` | Pusher 应用凭据 |
| `SECRET_KEY` | 会话签名密钥 |

### 初始化本地数据库

```bash
pnpm db:migrate   # 将 migrations/ 应用到本地 D1 数据库
```

### 开发

```bash
pnpm dev
```

打开 http://localhost:5173 — Vite 开发服务器在 Workerd 运行时 (Cloudflare Workers 模拟) 中运行应用, 支持热更新。

### 质量检查

```bash
pnpm lint       # eslint (typescript-eslint)
pnpm typecheck  # react-router typegen + tsc
```

## 便笺 Markdown 语法

便笺以纯文本存储, 使用轻量自研 Markdown 语法:

- **行级** — 标题 `# ## ###`、列表 `-` / `1.`、引用 `>`、图片 `![alt](url)`
- **行内** — 加粗 `**文字**`、斜体 `*文字*`、代码 `` `文字` ``、链接 `[文字](url)`
- **注解** (rough-notation, 持久化于文本):
  - `==高亮==` `^^下划线^^` `[[方框]]` `((圆圈))` `~~删除线~~` `××划掉××` `⟦括号⟧`
  - 三连标记 (`===` `^^^` `[[[` …) 表示多行变体
  - per-annotation 颜色: `[[#e11d48|文字]]` (任意 6 位 hex 前缀)

> 提示: 通常无需手写这些 — 编辑器的浮动工具栏 (BubbleMenu) 可在选中文本上应用/取消注解, 并提供 8 色颜色选择器。

## 本地双用户测试

1. 启动 `pnpm dev`
2. 打开两个浏览器档案 (或两个 Playwright 会话), 分别用两个 Google 账号登录
3. 双方打开同一背景板 — 成员头像与实时更新可确认实时频道正常
4. 在一个窗口新建 / 移动 / 删除便笺, 观察另一个窗口无需刷新即同步变化

## 部署

应用面向 **Cloudflare Workers** 设计:

```bash
pnpm run deploy   # react-router build && wrangler deploy
```

- D1 迁移: `pnpm db:migrate` (本地) / `wrangler d1 migrations apply co-note --remote` (生产)
- Worker secrets (`SECRET_KEY`、Google OAuth、Pusher) 通过 `wrangler secret put` 注入 (或由 CI/CD 流水线处理)
- CI/CD (GitHub Actions): `ci.yml` 在 PR 上运行 lint/typecheck/build; `deploy.yml` 在 push 到 `main` 时部署生产 (构建 → D1 迁移 → secrets → `wrangler deploy`)

完整配置指南见 `docs/DEPLOYMENT.md`。

## 目录结构

```
app/
  components/        UI 组件 (board / markdown / editor / ui)
  lib/               Markdown 解析器、TipTap 转换器、store、pusher 客户端
  routes/            页面 + API 路由
  routes/api/        REST API (notes, boards, invitations, images, pusher-auth…)
  server/            db (D1)、auth、oauth、pusher 触发
  app.css            全局 reset + Tailwind 主题 + 组件样式
migrations/          D1 schema 迁移
workers/app.ts       Cloudflare Worker 入口
docs/                规格、变更记录、代码质量评审
```

## License

MIT
