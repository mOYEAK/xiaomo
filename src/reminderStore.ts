import { DEFAULT_TIMEZONE, type ParsedReminder } from "./reminderParser";

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface ReminderRecord {
  id: string;
  user_id: string;
  content: string;
  source_message: string;
  target_time: string;
  timezone: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  retry_count: number;
  created_at?: string;
  updated_at?: string;
  sent_at?: string | null;
}

export interface ReminderStore {
  createReminder(userId: string, reminder: ParsedReminder): Promise<ReminderRecord>;
  listDueReminders(userId: string, now?: Date): Promise<ReminderRecord[]>;
  markReminderSent(id: string, now?: Date): Promise<void>;
}

export function hasSupabaseConfig(env: SupabaseEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseReminderStore(env: SupabaseEnv): ReminderStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    async createReminder(userId, reminder) {
      const response = await fetch(`${baseUrl}/rest/v1/reminders`, {
        method: "POST",
        headers: buildHeaders(serviceRoleKey, "return=representation"),
        body: JSON.stringify({
          user_id: userId,
          content: reminder.content,
          source_message: reminder.sourceMessage,
          target_time: reminder.targetTime,
          timezone: reminder.timezone || DEFAULT_TIMEZONE,
          status: "pending",
          retry_count: 0,
        }),
      });
      const records = await readJsonResponse<ReminderRecord[]>(response);
      const record = records[0];

      if (!record) {
        throw new Error("Supabase did not return the created reminder.");
      }

      return record;
    },

    async listDueReminders(userId, now = new Date()) {
      const url = new URL(`${baseUrl}/rest/v1/reminders`);
      url.searchParams.set("select", [
        "id",
        "user_id",
        "content",
        "source_message",
        "target_time",
        "timezone",
        "status",
        "retry_count",
        "created_at",
        "updated_at",
        "sent_at",
      ].join(","));
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("status", "eq.pending");
      url.searchParams.set("target_time", `lte.${now.toISOString()}`);
      url.searchParams.set("order", "target_time.asc");

      const response = await fetch(url, {
        headers: buildHeaders(serviceRoleKey),
      });

      return readJsonResponse<ReminderRecord[]>(response);
    },

    async markReminderSent(id, now = new Date()) {
      const url = new URL(`${baseUrl}/rest/v1/reminders`);
      url.searchParams.set("id", `eq.${id}`);

      const response = await fetch(url, {
        method: "PATCH",
        headers: buildHeaders(serviceRoleKey, "return=minimal"),
        body: JSON.stringify({
          status: "sent",
          sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        }),
      });

      if (!response.ok) {
        await throwSupabaseError(response);
      }
    },
  };
}

function buildHeaders(serviceRoleKey: string, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await throwSupabaseError(response);
  }

  return (await response.json()) as T;
}

async function throwSupabaseError(response: Response): Promise<never> {
  let detail = response.statusText;

  try {
    const payload = (await response.json()) as { message?: string; error?: string; details?: string };
    detail = payload.message ?? payload.error ?? payload.details ?? detail;
  } catch {
    try {
      detail = await response.text();
    } catch {
      // Keep the status text.
    }
  }

  throw new Error(`Supabase request failed: ${detail}`);
}
