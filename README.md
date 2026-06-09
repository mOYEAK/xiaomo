# Personal Agent

Cloudflare Workers + TypeScript implementation for two callback channels:

- `/chat`: Web chat UI for Agent Core testing
- `/api/chat`: JSON API for Agent Core testing
- `/mp`: WeChat Official Account
- `/wecom`: WeCom self-built app

## Local Development

```powershell
npm install
npm run typecheck
npm run verify:agent
npm run verify:auth
npm run verify:llm
npm run verify:memos
npm run verify:reminders
npm run verify:weather
npm run verify:search
npm run verify:web
npm run verify:mp
npm run verify:wecom
npm run dev
```

Deploy:

```powershell
npm run deploy
```

## Cloudflare Secrets

Configure real values as Cloudflare Worker secrets. Do not commit real secrets.

WeChat Official Account:

```powershell
npx wrangler secret put MP_TOKEN
npx wrangler secret put MP_APP_ID
npx wrangler secret put MP_APP_SECRET
```

If the Official Account message mode is encrypted:

```powershell
npx wrangler secret put MP_ENCODING_AES_KEY
```

WeCom self-built app:

```powershell
npx wrangler secret put WX_CORP_ID
npx wrangler secret put WX_APP_SECRET
npx wrangler secret put WX_AGENT_ID
npx wrangler secret put WX_TOKEN
npx wrangler secret put WX_ENCODING_AES_KEY
```

H5 reminders:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Kimi LLM:

```powershell
npx wrangler secret put LLM_API_KEY
npx wrangler secret put LLM_BASE_URL
npx wrangler secret put LLM_MODEL
```

Recommended Kimi values:

```text
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=kimi-k2.5
```

Tavily web search:

```powershell
npx wrangler secret put TAVILY_API_KEY
```

H5 personal access password:

```powershell
npx wrangler secret put H5_ACCESS_PASSWORD
npx wrangler secret put H5_SESSION_SECRET
```

When configured, `/chat` redirects unauthenticated visitors to `/login`, and `/api/*` returns HTTP 401.
`/`, `/mp`, and `/wecom` remain public.

## Callback URLs

Use separate paths for separate channels:

```text
Web chat:
https://personal-agent.ye344136941.workers.dev/chat

Web chat API:
https://personal-agent.ye344136941.workers.dev/api/chat

Due reminder API:
https://personal-agent.ye344136941.workers.dev/api/reminders/due?userId=web-user

Reminder list API:
https://personal-agent.ye344136941.workers.dev/api/reminders?userId=web-user&status=pending

Mark reminder as shown:
POST https://personal-agent.ye344136941.workers.dev/api/reminders/{id}/mark-sent

Cancel reminder:
POST https://personal-agent.ye344136941.workers.dev/api/reminders/{id}/cancel

Memo list API:
GET https://personal-agent.ye344136941.workers.dev/api/memos?userId=web-user

Delete memo:
POST https://personal-agent.ye344136941.workers.dev/api/memos/{id}/delete?userId=web-user

WeChat Official Account URL:
https://personal-agent.ye344136941.workers.dev/mp

WeCom URL:
https://personal-agent.ye344136941.workers.dev/wecom
```

Official Account behavior:

- GET verifies `signature`, `timestamp`, `nonce`, `echostr`.
- POST verifies and parses plaintext or encrypted messages, then returns `success` immediately.
- Text messages run the shared Agent Core in `ctx.waitUntil()`.
- The sender OpenID is used as the Agent `userId`.
- Agent results are returned through the Official Account custom-service message API.
- Custom-service text is safely truncated to the 2048-byte platform limit.
- Custom-service delivery failures are logged and do not affect H5.
- The Official Account channel does not proactively send scheduled reminders.

WeCom behavior:

- GET verifies `msg_signature`, `timestamp`, `nonce`, `echostr`.
- POST encrypted text messages return HTTP 200 immediately.
- A background task sends an app message reply through WeCom.
- WeCom is retained as a callback module, but H5 reminders do not depend on it.

## Supabase Schema

Create the `reminders` table before enabling H5 reminders:

```sql
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null,
  source_message text not null,
  target_time timestamptz not null,
  timezone text not null default 'Asia/Shanghai',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists reminders_due_idx
  on public.reminders (user_id, status, target_time);
```

Weather queries remember the most recently used city for each user. Create the preferences table:

```sql
create table if not exists public.user_preferences (
  user_id text primary key,
  weather_location_name text,
  weather_latitude double precision,
  weather_longitude double precision,
  weather_timezone text default 'Asia/Shanghai',
  updated_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null,
  source_message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memos_user_created_idx
  on public.memos (user_id, created_at desc);
```

## Agent Core

The first Agent Core version is channel-independent and rule-based. It accepts:

```ts
{ userId: string, text: string, channel: "web" | "mp" | "wecom" }
```

It returns:

```ts
{ reply: string, route: "web_summary" | "reminder" | "reminder_list" | "reminder_cancel" | "memo_create" | "memo_list" | "memo_search" | "memo_delete" | "weather" | "search" | "chat" }
```

Current routes:

- URL messages are read through Jina Reader and summarized by the configured LLM.
- reminder-like messages create Supabase reminders when H5 reminder storage is configured.
- reminder list/cancel messages return the current pending reminders and point users to the H5 controls.
- memo messages create, search, list, and delete Supabase memos.
- weather messages query Open-Meteo. A city stated by the user becomes their remembered city.
- search messages query Tavily Top 3 and use the configured LLM to synthesize an answer with sources.
- everything else routes to the configured OpenAI-compatible LLM.

`src/agentRuntime.ts` is the shared Agent Runtime constructor used by H5 and the
Official Account channel. It assembles the existing Supabase, Kimi, Tavily,
Open-Meteo, and Jina Reader clients in one place.

Web summary example:

```text
https://example.com/article
```

The first URL in a message is summarized into 3-5 key points, a short conclusion, and the original link.

Weather examples:

```text
明天上海天气怎么样
今天天气怎么样
周末北京会下雨吗
```

The first query with an explicit city saves that city in Supabase. Later queries may omit the city.

Search examples:

```text
搜索 TypeScript 6 新功能
帮我查一下最新人工智能新闻
```

Memo examples:

```text
记一下：护照放在书桌抽屉
我之前把护照放哪了
查看备忘录
删除备忘录
```
