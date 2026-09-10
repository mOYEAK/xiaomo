import { runAgent } from "../../core/agent/agent";
import {
  createAgentRuntime,
  type AgentRuntimeEnv,
} from "../../core/agent/runtime";
import { hasSupabaseConfig } from "../../config/env";
import {
  createSupabaseMemoStore,
  type MemoRecord,
} from "../../stores/memoStore";
import {
  createSupabaseReminderStore,
  type ReminderRecord,
  type ReminderStatus,
  type SupabaseEnv,
} from "../../stores/reminderStore";
import { htmlResponse, jsonResponse } from "../../lib/http";
import { toSafeErrorMessage } from "../../lib/errors";
import { buildChatHtml } from "../../views/chatPage";

interface ChatRequestBody {
  userId?: unknown;
  text?: unknown;
}

export async function handleChatPage(): Promise<Response> {
  return htmlResponse(buildChatHtml());
}

export async function handleChatApi(
  request: Request,
  env: AgentRuntimeEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON。" }, 400);
  }

  const userId = readUserId(body.userId);
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return jsonResponse({ error: "消息不能为空。" }, 400);
  }

  const result = await runAgent(
    {
      userId,
      text,
      channel: "web",
    },
    createAgentRuntime(env),
  );

  return jsonResponse(result);
}

export async function handleMemosApi(
  request: Request,
  env: SupabaseEnv,
): Promise<Response> {
  if (request.method !== "GET")
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  if (!hasSupabaseConfig(env))
    return jsonResponse({ memos: [], storageConfigured: false });

  try {
    const userId = readUserId(new URL(request.url).searchParams.get("userId"));
    const memos = await createSupabaseMemoStore(env).listMemos(userId);
    return jsonResponse({
      memos: memos.map(toMemoApiRecord),
      storageConfigured: true,
    });
  } catch (error) {
    console.error("Failed to list memos.", {
      error: toSafeErrorMessage(error),
    });
    return jsonResponse({ memos: [], storageConfigured: false });
  }
}

export async function handleDeleteMemoApi(
  request: Request,
  env: SupabaseEnv,
  memoId: string,
): Promise<Response> {
  if (request.method !== "POST")
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  if (!hasSupabaseConfig(env))
    return jsonResponse({ error: "Supabase is not configured." }, 503);

  try {
    const userId = readUserId(new URL(request.url).searchParams.get("userId"));
    await createSupabaseMemoStore(env).deleteMemo(userId, memoId);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Failed to delete memo.", {
      error: toSafeErrorMessage(error),
      memoId,
    });
    return jsonResponse({ error: "删除备忘失败，请稍后再试。" }, 500);
  }
}

export async function handleDueRemindersApi(
  request: Request,
  env: SupabaseEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasSupabaseConfig(env)) {
    return jsonResponse({ reminders: [], storageConfigured: false });
  }

  try {
    const url = new URL(request.url);
    const userId = readUserId(url.searchParams.get("userId"));
    const reminders =
      await createSupabaseReminderStore(env).listDueReminders(userId);

    return jsonResponse({
      reminders: reminders.map(toReminderApiRecord),
      storageConfigured: true,
    });
  } catch (error) {
    console.error("Failed to list due reminders.", {
      error: toSafeErrorMessage(error),
    });
    return jsonResponse({ error: "提醒查询失败，请稍后再试。" }, 500);
  }
}

export async function handleRemindersApi(
  request: Request,
  env: SupabaseEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasSupabaseConfig(env)) {
    return jsonResponse({ reminders: [], storageConfigured: false });
  }

  try {
    const url = new URL(request.url);
    const userId = readUserId(url.searchParams.get("userId"));
    const status = readReminderStatus(url.searchParams.get("status"));
    const reminders = await createSupabaseReminderStore(env).listReminders(
      userId,
      status,
    );

    return jsonResponse({
      reminders: reminders.map(toReminderApiRecord),
      storageConfigured: true,
    });
  } catch (error) {
    console.error("Failed to list reminders.", {
      error: toSafeErrorMessage(error),
    });
    return jsonResponse({ error: "提醒列表查询失败，请稍后再试。" }, 500);
  }
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

  try {
    const userId = readUserId(new URL(request.url).searchParams.get("userId"));
    await createSupabaseReminderStore(env).markReminderSent(userId, reminderId);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Failed to mark reminder sent.", {
      error: toSafeErrorMessage(error),
      reminderId,
    });
    return jsonResponse({ error: "提醒状态更新失败，请稍后再试。" }, 500);
  }
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

  try {
    const userId = readUserId(new URL(request.url).searchParams.get("userId"));
    await createSupabaseReminderStore(env).cancelReminder(userId, reminderId);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Failed to cancel reminder.", {
      error: toSafeErrorMessage(error),
      reminderId,
    });
    return jsonResponse({ error: "取消提醒失败，请稍后再试。" }, 500);
  }
}

function readUserId(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "web-user";
}

function readReminderStatus(value: string | null): ReminderStatus | undefined {
  if (
    value === "pending" ||
    value === "sent" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return undefined;
}

function toReminderApiRecord(
  reminder: ReminderRecord,
): Pick<
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

function toMemoApiRecord(
  memo: MemoRecord,
): Pick<MemoRecord, "id" | "content" | "created_at"> {
  return { id: memo.id, content: memo.content, created_at: memo.created_at };
}
