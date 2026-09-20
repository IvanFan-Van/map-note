# 🧭 旅行地图 (co-note)

地图旅行笔记应用 — 记录你旅途中的每一个地点, 构建一张属于自己的旅行地图。

## 功能

- **全屏交互式地图** (高德 JS API 2.0, GCJ-02 坐标), 支持缩放 / 拖拽, 并可通过浏览器 GPS 定位到当前位置
- **添加地点**: 定位当前位置 → 自动逆地理编码 → 弹出候选位置列表供选择; 不选择候选时, 可任意拖动标记到任何位置并自行填写名称 / 描述; 也支持关键词搜索地址
- **标记信息窗**: 点击标记弹出悬浮窗, 展示名称、地址、描述、照片组 (居中裁剪固定长宽、超出宽度横向滚动)、元信息、笔记预览; 双击信息窗进入编辑
- **路线箭头**: 标记之间按记录顺序以箭头直线相连 (由上一个地点指向最新地点)
- **标记聚合**: 地图缩小时相近标记自动聚合为标记组 — 单击标记组显示组内标记列表, 双击标记组自动缩放至全部标记可见; 点击列表项跳转到该标记并居中显示
- **笔记组**: 双击标记打开笔记组编辑器, 支持创建 / 编辑 / 删除 / 排序笔记
- **元信息**: 满意度 / 价格 / 性价比 / 好玩程度四个预设 + 自定义元信息, 每项 1-5 分
- **照片上传**: 每个地点可上传照片组 (PNG / JPG / WebP / GIF, ≤5MB)

## 技术栈

- React Router v7 (SSR) + React 19 + Tailwind CSS v4
- Cloudflare Workers + D1 (SQLite) + R2 (图片存储)
- 高德地图 JS API 2.0 (MarkerCluster 聚合 + ToolBar 控件)
- 高德 Web 服务地理编码代理 (搜索 / 逆地理编码, 服务端调用), Google OAuth 登录

## 开发

```bash
pnpm install
wrangler d1 migrations apply co-note --local   # 初始化本地数据库
pnpm dev                                       # http://localhost:5173
pnpm typecheck
pnpm build
pnpm deploy                                    # 构建并部署到 Cloudflare
```

需要环境变量: `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_AMAP_KEY`, `VITE_AMAP_SECURITY_CODE` (JS API, 客户端) 与 `AMAP_WEB_KEY` (Web 服务, 服务端), 参见 `.env.example`; 均在高德开放平台控制台申请。

坐标统一使用 GCJ-02 (高德坐标)。存量 WGS-84 数据由 `node scripts/convert-coords-to-gcj.mjs [--remote]` 一次性转换 (CI 部署后自动执行)。

## 部署

应用部署在 Cloudflare Workers, 自定义域名 `co-note.ivanfan.com`, D1 数据库与 R2 存储桶见 `wrangler.jsonc`。
