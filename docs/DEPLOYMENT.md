# 部署指南 (Cloudflare Workers + GitHub Actions CI/CD)

co-note 面向 Cloudflare Workers 部署: React Router SSR 构建产物 + D1 数据库 + R2 图片存储。
每次 push 到 `main` 自动完成: 检查 → 构建 → D1 迁移 → secrets 注入 → 部署。

> **当前生产地址: https://co-note.ivanfan.com** (自定义域名, 2026-08-06 绑定)
> 旧地址 `https://co-note.blues74285700.workers.dev` 已被 wrangler 自动禁用 (添加 custom domain 时); 如需恢复在 Dashboard → Workers → co-note → Settings → Domains & Routes 重新启用 workers.dev

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
| `GIPHY_API_KEY` | GIPHY 表情包搜索 API key (https://developers.giphy.com) |

### 3. Cloudflare 资源 (已存在则跳过)

```bash
wrangler d1 create co-note              # 生产 D1, 记下 uuid 填入 wrangler.jsonc
wrangler r2 bucket create co-note-images
wrangler d1 migrations apply co-note --remote   # 首次迁移
```

### 3.5 自定义域名 (co-note.ivanfan.com)

1. Cloudflare Dashboard → **Add a site** → 添加 `ivanfan.com` (Free 计划)
2. 到域名注册商 (阿里云) 把 NS 改成 Cloudflare 分配的两台, 等 Cloudflare 状态变 **Active**
3. `wrangler.jsonc` 已配置 `"routes": [{ "pattern": "co-note.ivanfan.com", "custom_domain": true }]` — 部署时自动创建 DNS 记录 + 签发 SSL 证书 (无需手动配置 DNS/证书)
4. 注意: 添加 custom domain 后 wrangler 会默认**禁用 workers.dev** 路由; 如需保留旧地址, 显式设置 `"workers_dev": true` (本仓库已设置, 但 dashboard 层禁用需手动重开, 见文首)

### 4. Google OAuth 回调

在 Google Cloud Console 的 OAuth 客户端中, 将
`https://co-note.ivanfan.com/auth/callback` 加入 Authorized redirect URIs。
(生产 worker 域名在首次部署后确定; 绑定自定义域名后需再添加对应回调。)`

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

- 访问 `https://co-note.ivanfan.com` (自动 HTTPS)
- 检查: 首页加载 / Google 登录 / 新建背景板 (便笺板 + 画布板) / 新建便笺 / 文本块 / 表情搜索 / 上传图片 / 邀请协作
- 实时同步需双账号验证 (见 README "双用户测试")

## 回滚

Workers 支持版本回滚 (Dashboard → Workers → co-note → Deployments → 回滚到上一版本)。
数据库迁移已应用的不会自动回退 — 破坏性迁移需手动处理 (D1 无自动回滚)。

## 常见问题

- **部署 403 / token 权限**: 检查 `CLOUDFLARE_API_TOKEN` 的权限范围 (Workers/D1/R2 Edit)
- **OAuth 登录失败 redirect_uri_mismatch**: 确认 Google Console 已添加生产回调 URL
- **图片 404**: 确认 R2 bucket `co-note-images` 存在且 binding `IMAGES` 生效
- **本地与生产数据分离**: 本地 dev 用 `--local` D1 (wrangler 本地模拟), 生产用 `--remote`, 互不影响
