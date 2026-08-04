# CRITIC.md — 项目评审报告

> 评审对象: co-note(共享便笺 · React Router v7 + Cloudflare Workers + D1 + R2 + Pusher)
> 评审方式: 全量代码阅读(前端/后端/迁移/配置/文档)+ git 历史核对 + **Playwright 浏览器实测验证(模拟真实用户操作)**
> 评审结论: **功能骨架完整,但存在 P0 级安全漏洞、P0 级实时协作正确性缺陷、重大工程化缺失,当前状态不具备上线条件。**
> 实测状态: 本报告中 **10 项关键缺陷已通过浏览器实测复现**(见第八章),标注 ✅ 实锤。

---

## 0. 总览评级

| 维度 | 评级 | 主要问题 | 实测 |
| --- | --- | --- | --- |
| 安全性 | 🔴 不合格 | Cookie 未标 Secure、开放重定向、文件类型信任客户端声明、email_verified 未校验 | S1/S2 ✅ |
| 实时协作正确性 | 🔴 不合格 | 切换背景板后 Pusher 订阅必失败、重连不拉全量、LWW 未实现、自己的操作依赖广播回显 | R1/R4/R5 ✅ |
| 功能完整性 | 🟠 部分缺失 | 删除便笺无 UI 入口、编辑页无实时订阅、移动端无创建便笺入口、规格承诺功能未实现 | D3/移动端 ✅ |
| 数据完整性 | 🟠 有风险 | 保存失败静默显示成功、上传竞态丢文本、无数据校验(Infinity/范围)、孤儿图片无 GC | D1/D4 ✅ |
| 代码质量 | 🟡 一般 | 重复实现、stale closure、全局 store 跨板残留、错误处理吞掉 | — |
| 工程化 | 🔴 缺失 | 零测试、无 CI、无 lint、Dockerfile 与 pnpm 冲突必然构建失败、README 为模板遗留 | E3 ✅ |

---

## 一、安全缺陷(P0,必须修复后才可上线)

### S1. 会话 Cookie 与 OAuth Cookie 均未标记 `secure`
- `app/server/auth.ts:11` — `COOKIE_BASE` 中 `secure: false`
- `app/server/oauth.ts:43` — OAuth 临时 Cookie 同样 `secure: false`
- 部署在 Cloudflare(强制 HTTPS),却允许 Cookie 走明文 HTTP 传输。若用户通过 `http://` 访问或被中间人降级,会话(含 30 天有效期)与 PKCE 验证器将明文暴露。
- **修复:** 生产环境 `secure: true`;本地 dev 由环境判断。

### S2. `returnTo` 开放重定向(Open Redirect)
- `app/routes/auth.login.tsx:7` — `returnTo` 完全取自 query string,不做任何校验
- `app/routes/auth.callback.tsx:31` — 登录成功后无条件 `redirect(oauth.returnTo)`
- 攻击者可构造 `https://site/auth/login?returnTo=https://evil.example`,受害者登录后被带去钓鱼站。
- **修复:** 仅允许站内相对路径(`/` 开头且不含 `//`),否则回落到 `/`。

### S3. 图片上传仅信任客户端声明的 MIME 类型
- `app/routes/api/images.tsx:38` — 只检查 `file.type`(客户端可任意伪造),不校验文件魔数
- 恶意用户可上传任意内容(HTML/SVG/脚本)并声明为 `image/png`;虽有类型白名单兜底,但 `Content-Type` 完全由攻击者控制,代理输出时 `writeHttpMetadata` 原样透传,存在内容混淆风险。
- **修复:** 用魔数校验(FF D8 FF / 89 50 4E 47 / RIFF WEBP / GIF8);或上传后重写 contentType,仅按白名单输出。

### S4. OAuth 用户信息未校验 `email_verified`
- `app/server/oauth.ts:137` — `userinfo` 响应仅取 `sub/email/name/picture`,忽略 `email_verified`
- 未验证邮箱的 Google 账号可入库并参与协作。建议拒绝 `email_verified === false`。

### S5. 其他安全观察
- **登录竞态:** `findOrCreateUserByGoogle`(`db.ts:44-49`)对并发首次登录无保护,第二个请求撞 `google_sub UNIQUE` 约束直接抛 500。应 `INSERT OR IGNORE` + 重查或捕获竞态。
- **无限请求:** 全部写接口无速率限制、无配额,任意登录用户可批量创建背景板/便笺/上传 5MB 图片打爆 R2 与 D1。
- **`request.formData()` 全量缓冲:** `api/images.tsx:20` 在检查 5MB 上限前已把整个请求体读入内存,大文件可消耗 Worker 内存(配合伪造 Content-Length 无意义,CF 有 body 上限兜底,但此处检查顺序仍是反的)。
- **链接注入 markdown:** `NoteCard.tsx` / `note.tsx` 渲染外部链接时未过滤自定义协议。react-markdown 默认过滤 `javascript:` 等协议,但图片 URL 可指向任意第三方站点,构成用户浏览行为泄露(IP/UA/时间)。
- **CSRF 依赖 SameSite=Lax:** 可接受,但 GET 触发的 `auth.logout.tsx:11` loader 登出是反模式(CSRF + 爬虫误触),应仅保留 POST。

---

## 二、实时协作正确性(P0 — 这是产品的核心卖点,目前是坏的)

### R1. 切换背景板后 Pusher 订阅必然失败
- `app/lib/pusher.ts:11-20` — `initPusher` 是**模块级单例**,`auth: { params: { boardId } }` 只在**首次初始化**时固化
- `app/routes/api/pusher-auth.tsx:22-24` — 服务端校验 `match[1] !== boardId`,即表单里的 `boardId` 必须与频道解析一致
- 用户先打开板 A(初始化时 auth 参数 = A),返回首页进入板 B:`subscribeBoard` 复用旧实例,鉴权请求仍携带 `boardId=A`,与频道 `presence-board-B` 不匹配 → **400,订阅被拒,板 B 完全没有实时功能**,直到整页刷新。这是必然复现的 bug,不是偶发。
- **讽刺的是:** 服务端本就能从 `channel_name` 解析出 boardId(`pusher-auth.tsx:21`),前端 `boardId` 参数完全多余。删除该参数、服务端以频道解析为准,即可修复。

### R2. 断线重连后不拉全量数据
- `app/lib/pusher.ts:53-57` — 重连只回调 `onConnected`(`board.tsx:133` 仅置 `setConnected(true)`)
- `board.tsx:109-137` — 没有任何重连后 `revalidate` / 全量拉取逻辑
- 规格文档 §6.8 白纸黑字承诺:"连接断开重连后重新调用 `GET /api/boards/:id` 全量拉取补齐"。**实现与规格不符。** 断线期间他人写入的便笺/连线/位置变更永久丢失,直到手动刷新。

### R3. LWW 冲突策略从未实现
- `app/lib/store.ts:164-183` — `applyPatch` 直接 `{...existing, ...patch.changes}` 覆盖,**没有任何 `updatedAt` 比较**
- 规格文档 §6.8 承诺"`updatedAt` 较旧者忽略 (LWW)"。实际是"后到者胜"——Pusher 投递顺序不保证与写入顺序一致,旧数据覆盖新数据是真实风险(例如 A 编辑页保存慢、B 已保存,随后 A 的过期 patch 到达并覆盖 B 的新内容)。
- 且 `note-position.tsx:45` 广播的 `changes` **不含 `zIndex`**(`moveNote` 明明支持),位置 patch 与创建 patch 合并后 z 层级不一致。

### R4. 自己的操作结果依赖 Pusher 回环,实时通道故障时位置"弹回"
- `NoteCard.tsx:79-80` — 卡片位置渲染 `isDragging ? dragNote.previewX : note.posX`
- `board.tsx:156-163` — `commitMove` 只调 PUT,成功与否都**不更新 store 中的 note 位置**
- 即:拖完松手后,store 里 `note.posX` 还是旧值。只有等自己的广播 patch 经 Pusher 回到自己并 `applyPatch` 后位置才"生效"。若 Pusher 不可用(占位凭据/超限/故障),**每次拖动后便笺都会弹回原位**,且无任何提示。规格 F4 承诺"松开 → mask 变为实际位置,便笺到位",实现却是依赖回环的脆弱设计。
- 同样的问题存在于 `board.tsx:71-78`(action 内联创建便笺)与双击创建(`board.tsx:148`)——store 不直接更新,全等 Pusher 回环。
- **修复:** 写操作成功后直接 `upsertNote` 本地落位,广播只是辅助。

### R5. 编辑页(note.tsx)完全没有实时订阅
- `app/routes/note.tsx` 全文无 Pusher 代码
- 规格 §7.5 承诺"编辑中他人变更通过 Pusher patch 合并进表单",未实现。两个人同时编辑同一便笺:双方各自看到自己版本,保存互相覆盖(且因 R3 无 LWW,覆盖顺序还不可预测)。

---

## 三、数据完整性与功能缺失

### D1. 保存失败却显示"已保存"
- `note.tsx:61-64` — `.catch(() => setSyncState("saved"))`:保存失败静默置为成功态
- 用户在断网/500 时会看着"已保存"关闭页面,内容永久丢失。**这是数据丢失级的 UX 缺陷。** 至少应区分"未保存/失败"状态并提示重试。

### D2. 图片上传存在 stale closure 竞态
- `note.tsx:96-131` — `uploadImage` 是每次渲染重建的普通函数,闭包捕获**创建时刻**的 `content`;第 125 行 `onContentChange(content + md)` 在 `await` 之后拼接旧快照
- 上传期间用户继续打字:新输入的内容在拼接时被丢弃(整段旧 content 被覆盖回写)。应使用 `setContent(prev => prev + md)` 的函数式更新。

### D3. 删除便笺没有任何 UI 入口
- 全库搜索:`deleteNote` 仅在 `api/note.tsx:60` 被调用(API 本身),**前端没有任何按钮/手势触发删除**
- 用户创建便笺后无法删除,只能改名……不,连改名都做不了。数据只能永久累积。规格 F5/F7 明确编辑器应有删除能力,缺失。

### D4. 输入校验缺失,可触发 500
- `note.tsx:31` — `fatigue` 仅查 `typeof number`,无范围校验;`DB CHECK (fatigue BETWEEN 0 AND 10)` 违反时 D1 抛异常 → **500**,而不是 400
- 所有数值参数(`x/y/zIndex/width/thickness`)均未做 `Number.isFinite` 校验;JSON 可表达 `1e999 → Infinity`,Infinity 可被写入 `pos_x`,后续前端 `worldToScreen` 计算全 NaN,画布崩溃
- `content`、`diet`、`name`(除创建板外)无长度上限,超大请求体消耗 Worker 内存。

### D5. 孤儿图片无 GC
- 删除便笺/编辑移除图片后,R2 对象永久留存。ADR #4 承认"MVP 可接受",但至少应在删除便笺时异步清理 `boards/{id}/notes/{noteId}/` 前缀对象,或提供定期清理任务。

### D6. 其他
- `invitations` 永不过期,pending 状态无限期堆积;
- 收件箱仅在打开面板时拉取一次(`home.tsx:142-144`),无轮询/实时,他人邀请无任何提醒;
- 便笺宽度 `width` 无范围校验,客户端可传 0 或负数导致渲染异常。

---

## 四、架构与代码质量问题

### A1. 同一操作两条实现路径,行为不一致
- 创建便笺:`api/notes.tsx`(走 `createNote` + 广播,z_index 递增)与 `board.tsx:71-78`(action 内联 SQL,**z_index 硬编码 0、不广播、不检查板存在**)
- 权限检查:`assertEditor`/`getBoardDetail` 与 `board.tsx:60-65`、`pusher-auth.tsx:25-29` 各写一遍 SQL
- 维护成本翻倍,且已经制造出 A2 的行为分叉。

### A2. 页面 action 与 API 路由职责重叠
`/b/:boardId` 的 action 与 `/api/notes` 都在创建便笺;`/api/boards/:id?action=default` 用 query string 表达动作。建议统一收敛到 API 层,页面只做渲染与跳转。

### A3. 全局 store 跨板残留
- `board.tsx` 卸载时不清空 store:`members`(上个板的人头继续显示在新板)、`selectedLinkId`(指向已不存在的 link,浮层隐藏但状态残留)、`linkDrag/dragNote` 残值。
- `useBoardStore` 是模块级单例,切板(尤其 SPA 导航)时旧板状态泄漏到新板,在线成员头像错乱。

### A4. 首屏 SSR 空白
- `store.ts` 初始 `notes: {}`;`board.tsx:105-107` 用 `useEffect` 填充
- SSR 输出的画布**没有任何便笺卡片**(loader 明明拉到了数据),客户端水合后 effect 才填充。便笺是应用的全部内容,首屏却一片空白闪烁。应将 loaderData 注入初始 store(如 `useRef(initialized)` 惰性初始化),或服务端直接以数据渲染。

### A5. 错误处理大规模吞掉
- `LinkLayer.tsx:119-120,140-141,153` — 颜色/粗细/删除全部 `.catch(() => void 0)`:失败无提示、本地状态不回滚,UI 与服务器状态悄悄分叉
- `board.tsx` 多处 `jsonApi().catch(() => setToast(...))` 后不刷新本地状态(见 R4)

### A6. 其他代码问题
- `note.tsx:125` stale closure(见 D2);
- `MOODS`/`WEATHERS` 在 `NoteCard.tsx:7-21` 与 `note.tsx:27-41` 重复定义,应提取共享常量;
- `board.tsx:320-335` 头像 `key={i}`——成员增删时头像错位闪烁;
- `board.tsx` toast 在他人每次 patch 时触发(`onPatch` 里 `setToast`),他人拖动便笺时 toast 连续刷屏,交互噪声大;
- `board.tsx:403-405` `GridBackground` 的 `transform: translate(0,0)` 冗余;
- `board.tsx:176` 连线目标命中取"第一个 <32px 的便笺",多便笺重叠时无最优选择;
- `board.tsx` 手写平移/捏合/拖拽三套手势互相穿插,`stopPropagation` 靠约定,后续维护风险高;
- `auth.ts:47-51` 用 `as` 强转 DB 行,无运行时校验;
- `home.tsx:112` 类型体操 `NonNullable<Route.ComponentProps["loaderData"]["user"]>`,脆弱;
- `note.tsx:127` 用 `alert()` 报错,且按钮无 loading/disabled 防重复提交;
- 无无障碍:返回箭头 `←`、图标按钮均无 `aria-label`,`title` 依赖不全面。

---

## 五、工程化缺失(不可接受的交付状态)

### E1. 零测试
`package.json` 无 `test` script,全库无任何单元/集成/E2E 测试。本项目包含:自研 OAuth PKCE 流程、Pusher HMAC-MD5 签名(手写签名实现极易出错)、自研画布手势、动态 SQL 拼接、权限矩阵——每一项都是典型缺陷高发区,零测试意味着**任何一次重构或升级都可能无声破坏核心功能**。R1/R4 这类 bug 本应在冒烟测试中拦下。

### E2. 无 CI、无 lint
- 无 eslint/prettier 配置,无 GitHub Actions 等流水线,`typecheck` 只靠本地自觉;
- 无 lint 检查,动态 SQL 拼接(`db.ts:249-255`)与类型断言(`auth.ts`)等坏味道无人把关。

### E3. Dockerfile 必然构建失败
- `Dockerfile` 使用 `npm ci` + `package-lock.json`,但项目是 **pnpm**(`pnpm-lock.yaml`,无 package-lock.json)→ `COPY ./package.json package-lock.json` 直接失败。
- 且本项目部署目标是 Cloudflare Workers(assets + SSR),Docker 构建产物 `build/server` 与 `react-router-serve` 的 Node 部署模式根本不在部署链路中。这是模板遗留的死配置,应删除或修正。

### E4. README 为模板遗留
- `README.md` 通篇是 create-react-router 模板原文(标题还是"Welcome to React Router!"),项目实际启动方式(`pnpm dev`、wrangler 部署、D1 迁移)毫无记载,新成员无法上手。

---

## 六、规格文档与实现脱节(文档失去"单一事实来源"价值)

规格文档 §6.8/§7.5 承诺而未实现的:
1. 重连后全量拉取补齐(实际无)——R2
2. LWW 合并策略(实际后到者胜)——R3
3. 编辑页 Pusher 合并(实际无)——R5
4. 图片上传读取 R2 customMetadata 尺寸(实际尺寸来自客户端表单)——D2 相关
5. 权限矩阵中 owner 的"重命名背景板/移除成员"——**整个功能不存在,无 API 无 UI**
6. 移动端"双指捏合/单指平移"规格与实现存疑:实现仅靠 Pointer Events 手写,无任何移动端测试佐证
7. "压缩 (canvas)"图片处理:未实现,原图直传

文档自己声明"是开发的单一事实来源,需求变更请先更新文档",但实现已偏离多处而文档未同步——文档目前更像是"愿望清单"而非事实记录。

---

## 七、优先级修复清单(建议顺序)

**必须先做(阻塞上线):**
1. S1 Cookie secure、S2 开放重定向、S3 魔数校验、S4 email_verified
2. R1 切板 Pusher 订阅失败(删掉前端 boardId 参数,服务端从 channel 解析)
3. R2 重连后全量拉取(接 `onConnected` 触发 `useRevalidator` 或重新 fetch)
4. R4 写操作成功后直接更新本地 store,去除回环依赖
5. D1 保存失败不得显示成功;D2 stale closure 改函数式更新
6. D3 补上删除便笺 UI(编辑器内按钮即可)

**随后(上线前):**
7. R3 实现 updatedAt LWW;R5 编辑页订阅 Pusher
8. D4 全参数校验(Number.isFinite + 范围白名单),400 而非 500
9. A3 store 切板清理、A4 SSR 首屏数据注入
10. 收件箱轮询/实时提醒

**工程化:**
11. 至少补 API 层冒烟测试(现有行为契约已被验证为真,可惜无自动化)
12. 建 CI(typecheck + 单测)、引入 lint
13. 清理 Dockerfile/README 模板遗留
14. 更新规格文档或建立"实现状态"对照表

---

## 八、Playwright 浏览器实测验证记录(2026-08-04)

### 8.1 测试环境与手段

| 项 | 说明 |
| --- | --- |
| 被测对象 | 本地 dev server(`pnpm dev`,Workers 运行时 + 本地 D1/R2 + 真实 Pusher 云端凭据) |
| 测试账号 | 本地 D1 注入用户 `testuser01`(editor)与 `testuser02`(viewer),背景板 `boardAAA`/`boardBBB` 及 3 张便笺 |
| 登录方式 | 按 React Router cookie-session 实现(`base64(JSON) + "." + base64url(HMAC-SHA256)`)以本地 `SECRET_KEY` 手工签发签名会话 Cookie,验证 `/api/user` 200 后进入浏览器 |
| 工具 | playwright-cli 0.1.17(真实 Chromium 模拟鼠标/触屏/网络拦截) |

> ⚠️ 测试数据说明: 测试向本地 D1 注入了上述测试用户/背景板/便笺,并将 `noteAAA1` 位置改为 (420,290)、`noteBBB1` 内容改为 `PROBE2_服务器二次修改`。仅影响本地开发库,不涉及生产;若需清理请从本地 D1 删除相关行。

### 8.2 实测结论(全部复现)

#### ✅ S1 实锤 — Cookie 缺少 Secure 标志
- 操作: `curl /auth/login` 抓取真实 `Set-Cookie` 响应头
- 实测: `set-cookie: co_note_oauth=...; Max-Age=600; Path=/; HttpOnly; SameSite=Lax` — **无 `Secure` 标志**(会话 Cookie 由同一 `COOKIE_BASE`(auth.ts:11, `secure: false`)签发)
- 结论: 中间人可截获 OAuth 验证器与(泄露场景下)会话 Cookie

#### ✅ S2 实锤 — 开放重定向
- 操作: `curl /auth/login?returnTo=https://evil.com`,base64 解码返回的 OAuth Cookie
- 实测: Cookie 内容为 `{"state":"...","codeVerifier":"...","returnTo":"https://evil.com"}` — **攻击者可控的 returnTo 被原样写入 Cookie**,回调(oauth.ts:82-93 → auth.callback.tsx:31)登录成功后执行 `redirect("https://evil.com")`
- 结论: 经典 Open Redirect,可被用于钓鱼

#### ✅ R1 实锤 — 切换背景板后 Pusher 订阅必失败
- 操作: 登录后点击进入板 A(SPA 导航)→ 检查订阅 → 返回首页 → 点击进入板 B
- 实测:
  ```
  [POST] /api/pusher/auth => [200] OK        (板 A,第 39 个请求)
  [POST] /api/pusher/auth => [400] Bad Request (板 B,第 44 个请求)
  ```
  板 B 顶部状态为「连接中」,永远无法变为「已连接」;板 B 无任何实时功能
- 结论: 根因与代码分析一致 — `lib/pusher.ts:16` 单例固化首次 `auth.params.boardId`,切板后鉴权参数与服务端校验(`pusher-auth.tsx:22`)冲突。**前端 boardId 参数本可删除**(服务端可从 channel_name 解析),该 bug 100% 复现

#### ✅ R4 实锤 — 自己的操作结果依赖 Pusher 回环,无回环时位置弹回
- 操作: 在实时失效的板 B 中,鼠标拖拽便笺从 (200,200) 到 (620,420) 并松手
- 实测:
  - 网络: `[PUT] /api/notes/noteBBB1/position => [200] OK`(服务器已保存新位置)
  - UI: 便笺 `left/top` 仍为 `200px/200px` — **弹回原位**
- 结论: `board.tsx:commitMove` 成功后不更新本地 store,位置仅靠自己的广播 patch 回显;实时通道故障时 UI 与服务器数据永久分叉,用户拖动"看起来无效",刷新后便笺又"瞬移"到别处。对比:板 A(实时正常)同操作位置正确更新,证明差异完全由回环依赖导致

#### ✅ R5 实锤 — 编辑页无实时订阅
- 操作: 打开便笺编辑页(内容为 A)→ 服务器端(PATCH 200)把内容改为 B → 等待 3 秒观察 textarea
- 实测: textarea 内容始终为 A,**服务器修改永不出现**
- 结论: 规格 §7.5 承诺"编辑中他人变更通过 Pusher patch 合并进表单"未实现;协同编辑时双方互相覆盖且无感知

#### ✅ D1 实锤 — 保存失败仍显示"已保存"
- 操作: Playwright 拦截 `PATCH /api/notes/noteBBB1` 返回 500 → 编辑页输入文本 → 等待防抖保存完成
- 实测: 页面顶部状态显示「已保存」(绿色),而请求实际失败、内容未落库
- 结论: `note.tsx:63` 的 `.catch(() => setSyncState("saved"))` 造成数据丢失无感知

#### ✅ D3 实锤 — 删除便笺无任何 UI 入口
- 操作: 打开便笺编辑页,全页快照检索「删除/delete/trash」等关键词
- 实测: **零匹配**。画布与编辑器均无删除便笺入口(删除连线浮层有「删除连线」按钮,便笺删除 API 存在但无调用方)
- 结论: 用户无法删除便笺,数据永久累积

#### ✅ D4 实锤 — 输入校验缺失导致 500
- 操作: 以会话 Cookie 直接调用 API
- 实测:
  ```
  PATCH /api/notes/noteBBB1 {"fatigue":99}  → 500
  Error: D1_ERROR: CHECK constraint failed: fatigue BETWEEN 0 AND 10
  PUT /api/notes/noteBBB1/position {"x":1e999,"y":0} → 500
  Error: D1_ERROR: NOT NULL constraint failed: notes.pos_x (Infinity 无法绑定)
  ```
- 结论: 非法输入全部落成 500(应为 400),且 `x=Infinity` 可污染 DB 写入路径

#### ✅ A4 实锤 — SSR 首屏空白
- 操作: 无浏览器环境下 `curl -H "Cookie: ..." /b/boardAAA` 抓取 SSR HTML
- 实测: HTML 中 `note-card` 出现 **0 次**;便笺文本仅存在于 `window.__reactRouterContext`(loader 数据序列化)中 — **SSR 渲染层没有任何便笺**,内容全部依赖客户端 JS 执行 + useEffect 填充
- 结论: 首屏空白闪烁、无 JS 环境不可用;store 初始状态未被 loaderData 初始化

#### ✅ 移动端实锤 — 无创建便笺入口
- 操作: 移动设备仿真打开板 A,快照检索创建入口;双击空白区域两次
- 实测: 页面仅「☆/邀请」按钮,**无任何创建便笺入口**;模拟双击后便笺数仍为 2、URL 未变化(触屏不产生 `dblclick`)
- 结论: 移动端用户无法创建便笺(唯一入口是桌面端双击),与规格"移动端支持"矛盾

#### ✅ E3 实锤 — Dockerfile 必然构建失败
- 静态核对: Dockerfile 使用 `npm ci` 与 `COPY package.json package-lock.json`,而项目为 **pnpm**(仅有 `pnpm-lock.yaml`)→ 首步 `COPY` 即失败;且产物 `build/server` 是 Node serve 模式,与 Cloudflare Workers 部署链路完全无关
- 结论: 模板遗留死配置,应删除或改造成 wrangler 部署文档

### 8.3 实测中额外发现的新问题

| # | 问题 | 证据 | 说明 |
| --- | --- | --- | --- |
| N1 | `GET /api/notes/:id` 返回 500 且**泄露 stack trace** | `curl /api/notes/noteBBB1` → React Router 内部错误页含完整 `Error.stack` | 该路由仅定义 action 未定义 loader;API 接口应统一 405 且不暴露堆栈(生产环境信息泄露) |
| N2 | `wrangler.jsonc` compatibility_date 无效 | dev 启动日志: `The latest compatibility date supported ... is "2025-11-25", but you've requested "2026-07-01". Falling back to "2025-11-25"` | 配置日期超前于运行时支持,静默回退,文档/配置与实际行为不一致 |
| N3 | dev server 在测试中崩溃一次(端口消失,重启恢复) | 操作过程中 `curl` 返回 000、`netstat` 无 LISTENING | 稳定性隐患,可能与写入 Infinity/约束错误触发 worker 异常有关,需排查(不确定是否为环境因素,评级待定) |

### 8.4 实测方法学说明

- 会话伪造: 直接按 React Router `encodeData + sign` 算法以 `SECRET_KEY` 签发 Cookie,跳过 Google OAuth 依赖,使纯本地环境可以完整走通"登录后用户操作"链路——这是验证前端行为(而非 OAuth 本身)的前提
- 板 B 的 Pusher 订阅失败状态(R1)恰好构成验证 R4 的"无回环环境",两缺陷相互叠加,实际用户场景正是如此
- 所有网络断言(200/400/500)均来自浏览器请求日志与 curl 响应码,非推断

---

*评审完成时间: 2026-08-04。本报告基于当前 main 分支(c079737)代码状态,第八章节为 Playwright 实测补充。*
