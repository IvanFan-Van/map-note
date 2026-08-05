# 部署指南 (Cloudflare Workers + GitHub Actions CI/CD)

co-note 面向 Cloudflare Workers 部署: React Router SSR 构建产物 + D1 数据库 + R2 图片存储。
每次 push 到 `main` 自动完成: 检查 → 构建 → D1 迁移 → secrets 注入 → 部署。

> **当前生产地址: https://co-note.blues74285700.workers.dev** (2026-08-05 首次部署)

## 架构

- **Worker**: `workers/app.ts` (React Router 请求处理器), 静态资源由 wrangler assets 托管
- **数据库**: Cloudflare D1 (`co-note`), 迁移文件在 `migrations/`
- **存储**: Cloudflare R2 (`co-note-images`), 绑定 `IMAGES`
- **密钥**: Worker secrets (`SECRET_KEY` / Google OAuth / Pusher), 由部署流水线 `wrangler secret put` 注入
- **实时**: Pusher (外部服务, 凭据同为 secrets)

## 一次性初始化

### 1. GitHub 仓库

```bash
git remote add origin https://github.com/<你>/<repo>.git
git push -u origin main
```

### 2. GitHub Actions Secrets

在仓库 `Settings → Secrets and variables → Actions` 配置:

| Secret | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token (需权限: Workers Scripts Edit / D1 Edit / R2 Edit / Account Settings Read) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| `SECRET_KEY` | 会话签名密钥 (随机长字符串) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 应用凭据 |
| `PUSHER_APP_ID` / `PUSHER_CLUSTER` / `PUSHER_KEY` / `PUSHER_SECRET` | Pusher 应用凭据 |

### 3. Cloudflare 资源 (已存在则跳过)

```bash
wrangler d1 create co-note              # 生产 D1, 记下 uuid 填入 wrangler.jsonc
wrangler r2 bucket create co-note-images
wrangler d1 migrations apply co-note --remote   # 首次迁移
```

### 4. Google OAuth 回调

在 Google Cloud Console 的 OAuth 客户端中, 将
`https://<你的worker>.workers.dev/auth/callback` 加入 Authorized redirect URIs。
(生产 worker 域名在首次部署后确定; 绑定自定义域名后需再添加对应回调。)

## 部署流程

### 自动部署 (推荐)

push 到 `main` → `.github/workflows/deploy.yml`:
1. `pnpm install --frozen-lockfile` + lint + typecheck + build
2. `wrangler d1 migrations apply co-note --remote` (幂等)
3. secrets 注入 (`wrangler secret put`)
4. `wrangler deploy` (上传 worker + assets)

PR 与推送非 main 分支只跑 `.github/workflows/ci.yml` (lint/typecheck/build)。

### 手动部署

```bash
pnpm run deploy   # react-router build && wrangler deploy
wrangler d1 migrations apply co-note --remote   # 迁移
wrangler secret put SECRET_KEY                  # 单独设置某密钥
```

### 手动触发 CI/CD

GitHub Actions → Deploy to Cloudflare Workers → Run workflow (workflow_dispatch)。

## 验证部署

- 访问 `https://co-note.<account>.workers.dev`
- 检查: 首页加载 / Google 登录 / 新建背景板 / 新建便笺 / 上传图片 / 邀请协作
- 实时同步需双账号验证 (见 README "双用户测试")

## 回滚

Workers 支持版本回滚 (Dashboard → Workers → co-note → Deployments → 回滚到上一版本)。
数据库迁移已应用的不会自动回退 — 破坏性迁移需手动处理 (D1 无自动回滚)。

## 常见问题

- **部署 403 / token 权限**: 检查 `CLOUDFLARE_API_TOKEN` 的权限范围 (Workers/D1/R2 Edit)
- **OAuth 登录失败 redirect_uri_mismatch**: 确认 Google Console 已添加生产回调 URL
- **图片 404**: 确认 R2 bucket `co-note-images` 存在且 binding `IMAGES` 生效
- **本地与生产数据分离**: 本地 dev 用 `--local` D1 (wrangler 本地模拟), 生产用 `--remote`, 互不影响
