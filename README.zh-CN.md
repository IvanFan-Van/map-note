# 🧭 地图探索 (map-note)

基于地图的内容探索平台 — 用户在地图上发布带定位的帖子, 浏览者按地点发现帖子。

## 功能

- **探索地图**: 全屏高德地图 (GCJ-02), 展示当前视野内有帖子的地点 — 单个帖子显示标记, 多个帖子显示数量气泡; 缩放 / 拖拽自动刷新
- **底部抽屉**: 点击地点标记弹出抽屉, 查看该地点下的帖子列表 (游标分页), 点击卡片进入帖子详情
- **帖子详情**: 公开分享页 (SSR), 展示标题 / 正文 / 照片组 / 作者 / 定位; 作者可编辑、删除、增删照片
- **发帖**: GPS 定位 / 关键词搜索 / 拖动标记选点 → 自动逆地理编码归一化到地点 → 填写标题、正文、可见性 (公开 / 私密), 并上传照片
- **账号**: Google OAuth 登录; 浏览无需登录, 发帖与编辑需登录; 私密帖子仅作者可见

## 技术栈

- React Router v7 (SSR) + React 19 + Tailwind CSS v4
- Cloudflare Workers + D1 (SQLite) + R2 (图片存储)
- 高德地图 JS API 2.0 (客户端脚本注入) + Web 服务地理编码 (服务端代理)
- Google OAuth 登录

## 数据模型

- `users`: Google 账号用户
- `locations`: 归一化地点 (按高德 POI ID 或坐标邻近 ~50m 合并), `post_count` 冗余公开帖子数
- `posts`: 帖子 (作者 / 地点 / 坐标与名称快照 / 可见性), 坐标统一 GCJ-02
- `post_media`: 帖子照片 (R2 key, 有序)

## 开发

```bash
pnpm install
pnpm db:migrate   # 初始化/更新本地 D1 (等价 wrangler d1 migrations apply map-note --local)
pnpm dev          # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm build
pnpm deploy       # 构建并部署到 Cloudflare
```

需要环境变量: `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_AMAP_KEY`, `VITE_AMAP_SECURITY_CODE` (JS API, 客户端) 与 `AMAP_WEB_KEY` (Web 服务, 服务端), 参见 `.env.example`; 均在高德开放平台控制台申请, JS API Key 需配置域名白名单。

## 部署

应用部署在 Cloudflare Workers, 自定义域名 `map-note.ivanfan.com`, D1 数据库与 R2 存储桶见 `wrangler.jsonc`。push `main` 自动执行 lint / typecheck / build、远程 D1 迁移与部署。
