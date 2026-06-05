import { runAgent } from "./agentCore";
import {
  createSupabaseReminderStore,
  hasSupabaseConfig,
  type ReminderRecord,
  type SupabaseEnv,
} from "./reminderStore";

interface ChatRequestBody {
  userId?: unknown;
  text?: unknown;
}

export async function handleChatPage(): Promise<Response> {
  return new Response(buildChatHtml(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function handleChatApi(request: Request, env: SupabaseEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "\u8bf7\u6c42\u4f53\u5fc5\u987b\u662f JSON\u3002" }, 400);
  }

  const userId = readUserId(body.userId);
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return jsonResponse({ error: "\u6d88\u606f\u4e0d\u80fd\u4e3a\u7a7a\u3002" }, 400);
  }

  const result = await runAgent(
    {
      userId,
      text,
      channel: "web",
    },
    {
      reminderStore: hasSupabaseConfig(env) ? createSupabaseReminderStore(env) : undefined,
    },
  );

  return jsonResponse(result);
}

export async function handleDueRemindersApi(request: Request, env: SupabaseEnv): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasSupabaseConfig(env)) {
    return jsonResponse({ reminders: [], storageConfigured: false });
  }

  const url = new URL(request.url);
  const userId = readUserId(url.searchParams.get("userId"));
  const reminders = await createSupabaseReminderStore(env).listDueReminders(userId);

  return jsonResponse({
    reminders: reminders.map(toReminderApiRecord),
    storageConfigured: true,
  });
}

export async function handleMarkReminderSentApi(
  request: Request,
  env: SupabaseEnv,
  reminderId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasSupabaseConfig(env)) {
    return jsonResponse({ error: "Supabase is not configured." }, 503);
  }

  await createSupabaseReminderStore(env).markReminderSent(reminderId);

  return jsonResponse({ ok: true });
}

function readUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "web-user";
}

function toReminderApiRecord(reminder: ReminderRecord): Pick<
  ReminderRecord,
  "id" | "content" | "source_message" | "target_time" | "timezone" | "status"
> {
  return {
    id: reminder.id,
    content: reminder.content,
    source_message: reminder.source_message,
    target_time: reminder.target_time,
    timezone: reminder.timezone,
    status: reminder.status,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function buildChatHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Personal Agent</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f6f8;
      color: #17181a;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      max-width: 880px;
      margin: 0 auto;
      background: #fff;
      border-left: 1px solid #e4e7eb;
      border-right: 1px solid #e4e7eb;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px;
      border-bottom: 1px solid #e4e7eb;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.3;
      font-weight: 650;
    }
    #status {
      color: #6a717c;
      font-size: 13px;
      line-height: 1.4;
      text-align: right;
    }
    #messages {
      padding: 18px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: min(680px, 86%);
      padding: 10px 12px;
      border-radius: 8px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 15px;
    }
    .user {
      align-self: flex-end;
      background: #1769c2;
      color: #fff;
    }
    .agent {
      align-self: flex-start;
      background: #eef1f4;
      color: #17181a;
    }
    .reminder {
      align-self: stretch;
      max-width: 100%;
      border-left: 4px solid #d18b00;
      background: #fff7e6;
      color: #2f2614;
    }
    form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 14px 20px 18px;
      border-top: 1px solid #e4e7eb;
      background: #fff;
    }
    textarea {
      width: 100%;
      min-height: 46px;
      max-height: 140px;
      resize: vertical;
      border: 1px solid #cbd2dc;
      border-radius: 8px;
      padding: 11px 12px;
      font: inherit;
      line-height: 1.4;
    }
    button {
      min-width: 76px;
      height: 46px;
      border: 0;
      border-radius: 8px;
      background: #17181a;
      color: #fff;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    button:disabled {
      opacity: .55;
      cursor: wait;
    }
    @media (max-width: 620px) {
      main { border: 0; }
      header { align-items: flex-start; flex-direction: column; }
      #status { text-align: left; }
      form { grid-template-columns: 1fr; }
      button { width: 100%; }
      .message { max-width: 94%; }
      .reminder { max-width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Personal Agent</h1>
      <div id="status">网页提醒已开启</div>
    </header>
    <section id="messages" aria-live="polite">
      <div class="message agent">你好，我是你的个人 Agent。可以先试试：明天 8 点提醒我带护照。</div>
    </section>
    <form id="chat-form">
      <textarea id="text" name="text" placeholder="输入消息..." autocomplete="off"></textarea>
      <button id="send" type="submit">发送</button>
    </form>
  </main>
  <script>
    const userId = localStorage.getItem("personal-agent-user-id") || "web-user";
    localStorage.setItem("personal-agent-user-id", userId);

    const form = document.getElementById("chat-form");
    const text = document.getElementById("text");
    const send = document.getElementById("send");
    const messages = document.getElementById("messages");
    const status = document.getElementById("status");
    const displayedReminderIds = new Set();
    let reportedStorageMissing = false;

    function addMessage(role, content) {
      const node = document.createElement("div");
      node.className = "message " + role;
      node.textContent = content;
      messages.appendChild(node);
      messages.scrollTop = messages.scrollHeight;
    }

    async function pollDueReminders() {
      try {
        const response = await fetch("/api/reminders/due?userId=" + encodeURIComponent(userId));
        const data = await response.json();

        if (!data.storageConfigured) {
          status.textContent = "提醒存储未配置";
          if (!reportedStorageMissing) {
            reportedStorageMissing = true;
            addMessage("agent", "提醒存储还没有配置。配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 后，网页提醒会自动启用。");
          }
          return;
        }

        status.textContent = "网页提醒已开启";

        for (const reminder of data.reminders || []) {
          if (displayedReminderIds.has(reminder.id)) continue;
          displayedReminderIds.add(reminder.id);
          addMessage("reminder", "提醒：" + reminder.content);
          await markReminderSent(reminder.id);
        }
      } catch {
        status.textContent = "提醒检查失败";
      }
    }

    async function markReminderSent(id) {
      try {
        await fetch("/api/reminders/" + encodeURIComponent(id) + "/mark-sent", {
          method: "POST",
        });
      } catch {
        status.textContent = "提醒状态更新失败";
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = text.value.trim();
      if (!value) return;

      addMessage("user", value);
      text.value = "";
      send.disabled = true;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, text: value }),
        });
        const data = await response.json();

        if (!response.ok) {
          addMessage("agent", data.error || "请求失败。");
        } else {
          addMessage("agent", data.reply);
          pollDueReminders();
        }
      } catch {
        addMessage("agent", "网络请求失败，请稍后再试。");
      } finally {
        send.disabled = false;
        text.focus();
      }
    });

    pollDueReminders();
    setInterval(pollDueReminders, 15000);
  </script>
</body>
</html>`;
}
