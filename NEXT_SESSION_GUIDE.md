
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