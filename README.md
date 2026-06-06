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
npm run verify:llm
npm run verify:reminders
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

WeChat Official Account URL:
https://personal-agent.ye344136941.workers.dev/mp

WeCom URL:
https://personal-agent.ye344136941.workers.dev/wecom
```

Official Account behavior:

- GET verifies `signature`, `timestamp`, `nonce`, `echostr`.
- POST text messages return a passive XML reply immediately.
- If `MP_APP_ID` and `MP_APP_SECRET` are configured, it also sends a background custom-service test reply.

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

## Agent Core

The first Agent Core version is channel-independent and rule-based. It accepts:

```ts
{ userId: string, text: string, channel: "web" | "mp" | "wecom" }
```

It returns:

```ts
{ reply: string, route: "web_summary" | "reminder" | "reminder_list" | "reminder_cancel" | "weather" | "search" | "chat" }
```

Current routes:

- URL messages route to future web summarization.
- reminder-like messages create Supabase reminders when H5 reminder storage is configured.
- reminder list/cancel messages return the current pending reminders and point users to the H5 controls.
- weather messages route to future weather API.
- search messages route to future web search.
- everything else routes to the configured OpenAI-compatible LLM.
