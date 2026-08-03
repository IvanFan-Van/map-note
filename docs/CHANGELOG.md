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
