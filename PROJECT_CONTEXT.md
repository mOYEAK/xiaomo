# Personal Agent 项目上下文

## 项目目标

构建一个低成本、可长期迭代的个人生活助理。

当前主入口是受访问口令保护的 H5 网页。企业微信和微信公众号模块保留，但暂不作为主要入口，也未接入完整 Agent Core。

## 当前部署

- 仓库：`D:\workspace\personal_agent`
- GitHub：`https://github.com/mOYEAK/xiaomo.git`
- 分支：`main`
- Worker：`https://personal-agent.ye344136941.workers.dev`
- H5：`https://personal-agent.ye344136941.workers.dev/chat`
- 最新提交：`59a0587 feat: protect h5 with access password`
- 当前部署版本：`0325418f-367c-49f0-84bc-9d4b6ac0d8c2`
- 工作区：存在本次微信公众号接入 Agent Core 的未提交修改

## 关键决策

1. H5 网页作为第一阶段主入口，不依赖企业微信。
2. Cloudflare Workers 负责后端、路由和 H5 页面。
3. Supabase PostgreSQL 负责提醒、备忘录和用户偏好。
4. Agent Core 与消息渠道解耦。
5. 第一版使用规则路由，减少 LLM 成本和误判。
6. 普通聊天和内容归纳使用 Kimi OpenAI-compatible API。
7. 网页正文优先使用 Jina Reader，失败时尝试直接读取。
8. 天气使用免密钥 Open-Meteo。
9. 联网搜索使用 Tavily Top 3，再由 Kimi 综合回答。
10. 提醒暂不使用 Cron 或后台主动推送；H5 打开时每 15 秒轮询。
11. Cloudflare Access 因激活需要付款方式而放弃。
12. H5 改用 Worker 内置访问口令保护。
13. 当前为单用户模式，默认 `userId = web-user`。
14. 企业微信和公众号模块保留，不删除，但目前仅提供测试回复。

## 已完成功能

### H5 与认证

- `/login`：访问口令登录页。
- `/logout`：清除登录 Cookie。
- `/chat`：未登录时跳转 `/login`。
- `/api/*`：未登录时返回 HTTP 401。
- 登录后设置 7 天有效的 HMAC 签名 HttpOnly Cookie。
- `/`、`/mp`、`/wecom` 保持公开。
- H5 顶部提供“退出”链接。

认证 Secrets：

- `H5_ACCESS_PASSWORD`
- `H5_SESSION_SECRET`

不要把实际口令或 Secret 写入仓库或上下文文档。

### 提醒系统

- 支持创建、查看、取消提醒。
- 支持日期表达：
  - 今天、今晚、明天、后天
  - 明早、明晚
  - 下周一至下周日
  - 上午、下午、晚上等时段
- 支持相对时间：
  - `5 分钟后提醒我测试`
  - `两小时后提醒我出发`
- H5 显示待提醒列表。
- 到点后显示页面弹窗并可选播放提示音。
- 点击“知道了”后标记为 `sent`，避免重复展示。
- 网页关闭时不保证提醒。

### 智能备忘录

- `记一下：护照放在书桌抽屉`
- `我之前把护照放哪了`
- `查看备忘录`
- `删除备忘录`
- H5 右侧显示备忘录列表并支持按钮删除。
- 使用 Supabase `memos` 表。
- 当前使用简单文本 `ilike` 搜索，不做 RAG。

### 天气查询

- 使用 Open-Meteo Geocoding 与 Forecast API。
- 支持今天、明天、后天、周末。
- 返回天气状况、最高/最低温、降雨概率、风速和出行建议。
- 查询明确城市成功后保存最近城市。
- 后续可省略城市，例如先问上海，再问“今天天气怎么样”。
- 最近城市存储在 `user_preferences` 表。

### 联网搜索

- 使用 Tavily `basic` 搜索，最多 Top 3。
- 最新、新闻、最近等请求使用 `news` topic。
- 其他请求使用 `general` topic。
- 使用 Kimi 根据搜索结果综合回答。
- 回答末尾附来源标题和 URL。
- 搜索失败或无结果时不编造答案。

### 网页总结

- 提取消息中的第一个 URL。
- 使用 Jina Reader 读取正文。
- Jina 失败时尝试直接读取 HTML。
- 超长正文截断。
- Kimi 输出 3–5 个要点、简短结论和原文链接。
- 登录墙或受限链接返回明确提示。

### 普通聊天

- 使用 Kimi `kimi-k2.5`。
- 通过 OpenAI-compatible `/chat/completions` 接口调用。
- 普通对话不会进入搜索、天气或提醒工具。

### 微信模块现状

#### `/mp` 微信公众号

- 支持 URL 签名验证。
- 支持明文和加密消息解析。
- POST 文本消息验签、解密和解析后立即返回 `success`。
- 使用 `ctx.waitUntil()` 异步调用真实 Agent Core，避免等待搜索、网页读取或 LLM。
- 使用发送者 OpenID 作为 Agent `userId`。
- Agent 结果通过公众号客服消息 API 返回。
- 客服文本按平台 2048 字节限制安全截断。
- Agent 或客服消息失败会输出不含 Secret 的明确日志，不影响 H5。
- `/mp` 保持公开，不受 H5 访问口令保护。
- 公众号不实现主动定时提醒推送。

#### `/wecom` 企业微信

- 支持 URL 验证、消息解密和测试主动回复。
- 尚未调用真实 Agent Core。
- 本阶段不依赖企业微信。

## 当前 Agent 路由

```ts
type AgentRoute =
  | "web_summary"
  | "reminder"
  | "reminder_list"
  | "reminder_cancel"
  | "memo_create"
  | "memo_list"
  | "memo_search"
  | "memo_delete"
  | "weather"
  | "search"
  | "chat";
```

## Agent Runtime

- `src/agentRuntime.ts` 是统一 Agent Runtime 构造器。
- H5 与微信公众号复用现有 Supabase、Kimi、Tavily、Open-Meteo、Jina Reader 客户端。
- 企业微信模块保留原状，公众号接入不依赖企业微信。

## 公众号限制与运维注意

- 回调必须快速返回；当前 POST 返回 `success`，慢任务进入 `ctx.waitUntil()`。
- Cloudflare Workers 的 `waitUntil()` 不是可靠任务队列，超慢任务仍可能被平台取消。
- 客服消息受公众号权限和用户互动窗口约束，无法发送时只记录失败日志。
- 当前 Cloudflare Secrets 已包含 `MP_TOKEN`、`MP_APP_ID`、`MP_APP_SECRET`；`MP_ENCODING_AES_KEY` 仅在公众号启用 AES 消息模式时需要配置。
- 不要读取、输出或提交任何 Secret。

## 2026-06-07 线上验收

- 已部署 Worker 版本 `0325418f-367c-49f0-84bc-9d4b6ac0d8c2`。
- `/` 返回 HTTP 200。
- `/chat` 未登录时跳转 `/login`。
- `/api/chat` 未登录时返回 HTTP 401。
- `/mp` 无签名时返回 HTTP 403，证明路由公开且进入公众号处理器。
- `/mp` 无效签名 POST 返回 `success`，不触发 Agent。
- `/wecom` 无签名时返回 HTTP 403，模块保持公开且未删除。
- 真实公众号客服回复需要由真实微信用户发送消息进行最终验收，不读取 Secret、不伪造 OpenID。
