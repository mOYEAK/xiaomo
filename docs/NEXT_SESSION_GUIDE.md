
## 2. `NEXT_SESSION_GUIDE.md`

```markdown
# Personal Agent 下一会话执行手册

## 首先加载

新会话开始时：

1. 阅读 `PROJECT_CONTEXT.md`。
2. 阅读 `README.md`。
3. 检查仓库状态：

```powershell
git status --short
git log --oneline -5
npx wrangler deployments status
npx wrangler secret list
```

## 当前公众号接入状态

- `/mp` GET 保留公众号 URL 签名验证。
- `/mp` POST 保留明文签名校验与 AES 消息解密。
- 文本消息立即返回 `success`，并通过 `ctx.waitUntil()` 异步调用 Agent Core。
- Agent Runtime 由 `src/agentRuntime.ts` 统一构造，H5 和公众号复用同一套客户端。
- 公众号用户 ID 使用发送者 OpenID。
- Agent 结果通过公众号客服消息 API 返回；发送失败只记安全日志，不影响 H5。
- `/mp` 位于 H5 认证判断之前，必须始终保持公开。
- 不要让公众号接入依赖 `/wecom`，也不要删除企业微信模块。
- 不实现公众号主动定时提醒。

## 公众号验证命令

```powershell
npm run typecheck
npm run verify:mp
npm run verify:auth
npm run deploy
npx wrangler deployments status
```

`verify:mp` 覆盖快速响应、OpenID 透传、异步 Agent、客服发送失败、非文本消息、
验签失败和客服文本长度限制。`verify:auth` 覆盖启用 H5 口令时 `/mp` 仍公开。
