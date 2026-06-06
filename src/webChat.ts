import { runAgent } from "./agentCore";
import {
  createOpenAiCompatibleLlmClient,
  hasLlmConfig,
  type LlmEnv,
} from "./llmClient";
import {
  createSupabaseReminderStore,
  hasSupabaseConfig,
  type ReminderRecord,
  type ReminderStatus,
  type SupabaseEnv,
} from "./reminderStore";

export interface ChatEnv extends SupabaseEnv, LlmEnv {}

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

export async function handleChatApi(request: Request, env: ChatEnv): Promise<Response> {
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
      llmClient: hasLlmConfig(env) ? createOpenAiCompatibleLlmClient(env) : undefined,
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

export async function handleRemindersApi(request: Request, env: SupabaseEnv): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasSupabaseConfig(env)) {
    return jsonResponse({ reminders: [], storageConfigured: false });
  }

  const url = new URL(request.url);
  const userId = readUserId(url.searchParams.get("userId"));
  const status = readReminderStatus(url.searchParams.get("status"));
  const reminders = await createSupabaseReminderStore(env).listReminders(userId, status);

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

export async function handleCancelReminderApi(
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

  await createSupabaseReminderStore(env).cancelReminder(reminderId);

  return jsonResponse({ ok: true });
}

function readUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "web-user";
}

function readReminderStatus(value: string | null): ReminderStatus | undefined {
  if (value === "pending" || value === "sent" || value === "failed" || value === "cancelled") {
    return value;
  }

  return undefined;
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
      background: #f4f6f8;
      color: #17181a;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      max-width: 1120px;
      margin: 0 auto;
      background: #fff;
      border-left: 1px solid #e1e5ea;
      border-right: 1px solid #e1e5ea;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px;
      border-bottom: 1px solid #e1e5ea;
    }
    h1, h2 {
      margin: 0;
      line-height: 1.3;
      font-weight: 650;
    }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; }
    #status {
      color: #64707d;
      font-size: 13px;
      line-height: 1.4;
      text-align: right;
    }
    #workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      min-height: 0;
    }
    #messages {
      padding: 18px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
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
    .reminder-message {
      align-self: stretch;
      max-width: 100%;
      border-left: 4px solid #c78100;
      background: #fff7e6;
      color: #2f2614;
    }
    aside {
      border-left: 1px solid #e1e5ea;
      background: #fafbfc;
      padding: 16px;
      overflow-y: auto;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .text-button {
      min-width: 0;
      height: 32px;
      padding: 0 10px;
      border: 1px solid #cbd2dc;
      background: #fff;
      color: #17181a;
      font-size: 13px;
      font-weight: 600;
    }
    #reminder-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .reminder-card {
      border: 1px solid #dce2ea;
      border-radius: 8px;
      background: #fff;
      padding: 11px;
    }
    .reminder-card.due {
      border-color: #d18b00;
      background: #fff8ea;
    }
    .reminder-time {
      color: #5d6875;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .reminder-content {
      font-size: 14px;
      line-height: 1.45;
      word-break: break-word;
    }
    .reminder-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }
    .cancel-button {
      min-width: 0;
      height: 30px;
      padding: 0 10px;
      border: 1px solid #d6b7b7;
      background: #fff;
      color: #8f1d1d;
      font-size: 13px;
      font-weight: 600;
    }
    .empty {
      color: #6b7480;
      font-size: 14px;
      line-height: 1.5;
      padding: 10px 0;
    }
    form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 14px 20px 18px;
      border-top: 1px solid #e1e5ea;
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
    #due-banner {
      position: fixed;
      left: 50%;
      top: 18px;
      transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px));
      border: 1px solid #d18b00;
      border-radius: 8px;
      background: #fff7e6;
      box-shadow: 0 10px 30px rgba(20, 28, 38, .18);
      padding: 14px;
      z-index: 20;
    }
    #due-banner[hidden] { display: none; }
    .banner-title {
      font-weight: 700;
      margin-bottom: 6px;
    }
    .banner-content {
      line-height: 1.5;
      word-break: break-word;
    }
    .banner-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }
    #ack-due {
      height: 34px;
      min-width: 82px;
    }
    @media (max-width: 780px) {
      main { border: 0; }
      header { align-items: flex-start; flex-direction: column; }
      #status { text-align: left; }
      #workspace { grid-template-columns: 1fr; }
      aside { border-left: 0; border-top: 1px solid #e1e5ea; }
      form { grid-template-columns: 1fr; }
      button { width: 100%; }
      .message { max-width: 94%; }
      .reminder-message { max-width: 100%; }
      .text-button, .cancel-button, #ack-due { width: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Personal Agent</h1>
      <div id="status">网页提醒已开启</div>
    </header>
    <section id="workspace">
      <section id="messages" aria-live="polite">
        <div class="message agent">你好，我是你的个人 Agent。可以先试试：明天 8 点提醒我带护照。</div>
      </section>
      <aside aria-label="提醒列表">
        <div class="panel-head">
          <h2>提醒</h2>
          <button class="text-button" id="refresh-reminders" type="button">刷新</button>
        </div>
        <div id="reminder-list">
          <div class="empty">正在加载提醒...</div>
        </div>
      </aside>
    </section>
    <form id="chat-form">
      <textarea id="text" name="text" placeholder="输入消息..." autocomplete="off"></textarea>
      <button id="send" type="submit">发送</button>
    </form>
  </main>
  <section id="due-banner" role="alertdialog" aria-live="assertive" hidden>
    <div class="banner-title">提醒到了</div>
    <div class="banner-content" id="due-content"></div>
    <div class="banner-actions">
      <button id="ack-due" type="button">知道了</button>
    </div>
  </section>
  <script>
    const userId = localStorage.getItem("personal-agent-user-id") || "web-user";
    localStorage.setItem("personal-agent-user-id", userId);

    const form = document.getElementById("chat-form");
    const text = document.getElementById("text");
    const send = document.getElementById("send");
    const messages = document.getElementById("messages");
    const status = document.getElementById("status");
    const reminderList = document.getElementById("reminder-list");
    const refreshReminders = document.getElementById("refresh-reminders");
    const dueBanner = document.getElementById("due-banner");
    const dueContent = document.getElementById("due-content");
    const ackDue = document.getElementById("ack-due");
    const displayedReminderIds = new Set();
    let activeDueReminder = null;
    let reportedStorageMissing = false;

    function addMessage(role, content) {
      const node = document.createElement("div");
      node.className = "message " + role;
      node.textContent = content;
      messages.appendChild(node);
      messages.scrollTop = messages.scrollHeight;
    }

    function formatTime(value) {
      const date = new Date(value);
      return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    function isDue(reminder) {
      return reminder.status === "pending" && new Date(reminder.target_time).getTime() <= Date.now();
    }

    function playReminderSound() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.value = 0.05;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.18);
      } catch {
        // Audio is optional.
      }
    }

    async function loadReminderList() {
      try {
        const response = await fetch("/api/reminders?userId=" + encodeURIComponent(userId) + "&status=pending");
        const data = await response.json();

        if (!data.storageConfigured) {
          reminderList.innerHTML = '<div class="empty">提醒存储未配置。</div>';
          return;
        }

        renderReminderList(data.reminders || []);
      } catch {
        reminderList.innerHTML = '<div class="empty">提醒列表加载失败。</div>';
      }
    }

    function renderReminderList(reminders) {
      reminderList.textContent = "";

      if (!reminders.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "暂无待提醒。";
        reminderList.appendChild(empty);
        return;
      }

      for (const reminder of reminders) {
        const card = document.createElement("article");
        card.className = "reminder-card" + (isDue(reminder) ? " due" : "");

        const timeNode = document.createElement("div");
        timeNode.className = "reminder-time";
        timeNode.textContent = (isDue(reminder) ? "已到点 · " : "待提醒 · ") + formatTime(reminder.target_time);

        const contentNode = document.createElement("div");
        contentNode.className = "reminder-content";
        contentNode.textContent = reminder.content;

        const actions = document.createElement("div");
        actions.className = "reminder-actions";

        const cancel = document.createElement("button");
        cancel.className = "cancel-button";
        cancel.type = "button";
        cancel.textContent = "取消";
        cancel.addEventListener("click", () => cancelReminder(reminder.id));

        actions.appendChild(cancel);
        card.appendChild(timeNode);
        card.appendChild(contentNode);
        card.appendChild(actions);
        reminderList.appendChild(card);
      }
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
          showDueReminder(reminder);
          break;
        }

        loadReminderList();
      } catch {
        status.textContent = "提醒检查失败";
      }
    }

    function showDueReminder(reminder) {
      activeDueReminder = reminder;
      dueContent.textContent = reminder.content;
      dueBanner.hidden = false;
      addMessage("reminder-message", "提醒：" + reminder.content);
      playReminderSound();
    }

    async function markReminderSent(id) {
      try {
        await fetch("/api/reminders/" + encodeURIComponent(id) + "/mark-sent", {
          method: "POST",
        });
        await loadReminderList();
      } catch {
        status.textContent = "提醒状态更新失败";
      }
    }

    async function cancelReminder(id) {
      try {
        await fetch("/api/reminders/" + encodeURIComponent(id) + "/cancel", {
          method: "POST",
        });
        addMessage("agent", "已取消这条提醒。");
        await loadReminderList();
      } catch {
        addMessage("agent", "取消提醒失败，请稍后再试。");
      }
    }

    ackDue.addEventListener("click", async () => {
      if (!activeDueReminder) return;
      const reminder = activeDueReminder;
      activeDueReminder = null;
      dueBanner.hidden = true;
      await markReminderSent(reminder.id);
      pollDueReminders();
    });

    refreshReminders.addEventListener("click", loadReminderList);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = text.value.trim();
      if (!value) return;

      addMessage("user", value);
      text.value = "";
      send.disabled = true;
      status.textContent = "正在思考...";

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
          loadReminderList();
          pollDueReminders();
        }
      } catch {
        addMessage("agent", "网络请求失败，请稍后再试。");
      } finally {
        send.disabled = false;
        status.textContent = "网页提醒已开启";
        text.focus();
      }
    });

    loadReminderList();
    pollDueReminders();
    setInterval(pollDueReminders, 15000);
  </script>
</body>
</html>`;
}
