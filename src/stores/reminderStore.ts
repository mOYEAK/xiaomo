import {
  createSupabaseRestClient,
  type SupabaseEnv,
  type SupabaseRestClient,
} from "../clients/supabase";
import { DEFAULT_TIMEZONE } from "../lib/time";
import type { ParsedReminder } from "../core/agent/reminderParser";

export type { SupabaseEnv };

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

export type ReminderStatus = ReminderRecord["status"];

export interface ReminderStore {
  createReminder(
    userId: string,
    reminder: ParsedReminder,
  ): Promise<ReminderRecord>;
  listReminders(
    userId: string,
    status?: ReminderStatus,
  ): Promise<ReminderRecord[]>;
  listDueReminders(userId: string, now?: Date): Promise<ReminderRecord[]>;
  markReminderSent(userId: string, id: string, now?: Date): Promise<void>;
  cancelReminder(userId: string, id: string, now?: Date): Promise<void>;
}

export function createSupabaseReminderStore(env: SupabaseEnv): ReminderStore {
  return createReminderStore(createSupabaseRestClient(env));
}

export function createReminderStore(rest: SupabaseRestClient): ReminderStore {
  return {
    async createReminder(userId, reminder) {
      const records = await rest.fetchJson<ReminderRecord[]>(
        rest.createUrl("reminders"),
        {
          method: "POST",
          prefer: "return=representation",
          body: JSON.stringify({
            user_id: userId,
            content: reminder.content,
            source_message: reminder.sourceMessage,
            target_time: reminder.targetTime,
            timezone: reminder.timezone || DEFAULT_TIMEZONE,
            status: "pending",
            retry_count: 0,
          }),
        },
      );
      const record = records[0];

      if (!record) {
        throw new Error("Supabase did not return the created reminder.");
      }

      return record;
    },

    async listReminders(userId, status) {
      const url = createReminderListUrl();
      url.searchParams.set("user_id", `eq.${userId}`);

      if (status) {
        url.searchParams.set("status", `eq.${status}`);
      }

      return rest.fetchJson<ReminderRecord[]>(url);
    },

    async listDueReminders(userId, now = new Date()) {
      const url = createReminderListUrl();
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("status", "eq.pending");
      url.searchParams.set("target_time", `lte.${now.toISOString()}`);

      return rest.fetchJson<ReminderRecord[]>(url);
    },

    async markReminderSent(userId, id, now = new Date()) {
      const url = rest.createUrl("reminders");
      url.searchParams.set("id", `eq.${id}`);
      url.searchParams.set("user_id", `eq.${userId}`);

      await rest.fetchVoid(url, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          status: "sent",
          sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        }),
      });
    },

    async cancelReminder(userId, id, now = new Date()) {
      const url = rest.createUrl("reminders");
      url.searchParams.set("id", `eq.${id}`);
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("status", "eq.pending");

      await rest.fetchVoid(url, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          status: "cancelled",
          updated_at: now.toISOString(),
        }),
      });
    },
  };

  function createReminderListUrl(): URL {
    const url = rest.createUrl("reminders");
    url.searchParams.set(
      "select",
      [
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
      ].join(","),
    );
    url.searchParams.set("order", "target_time.asc");
    return url;
  }
}
