import assert from "node:assert/strict";
import { createSupabaseReminderStore } from "../dist/verify/reminderStore.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
};

async function main() {
  await verifyCreateReminder();
  await verifyListReminders();
  await verifyListDueReminders();
  await verifyMarkReminderSent();
  await verifyCancelReminder();

  console.log("Reminder API local verification passed.");
}

async function verifyCreateReminder() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify([
        {
          id: "reminder-1",
          user_id: "web-user",
          content: "\u5e26\u62a4\u7167",
          source_message: "\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167",
          target_time: "2026-06-06T00:00:00.000Z",
          timezone: "Asia/Shanghai",
          status: "pending",
          retry_count: 0,
        },
      ]),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const store = createSupabaseReminderStore(env);
  const record = await store.createReminder("web-user", {
    content: "\u5e26\u62a4\u7167",
    sourceMessage: "\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167",
    targetTime: "2026-06-06T00:00:00.000Z",
    timezone: "Asia/Shanghai",
  });

  assert.equal(record.id, "reminder-1");
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), "https://example.supabase.co/rest/v1/reminders");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Prefer, "return=representation");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.user_id, "web-user");
  assert.equal(body.content, "\u5e26\u62a4\u7167");
  assert.equal(body.status, "pending");
  assert.equal(body.retry_count, 0);
}

async function verifyListReminders() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const store = createSupabaseReminderStore(env);
  await store.listReminders("web-user", "pending");

  assert.equal(calls.length, 1);
  const url = new URL(String(calls[0].input));
  assert.equal(url.searchParams.get("user_id"), "eq.web-user");
  assert.equal(url.searchParams.get("status"), "eq.pending");
  assert.equal(url.searchParams.get("order"), "target_time.asc");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_example");
}

async function verifyListDueReminders() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const store = createSupabaseReminderStore(env);
  await store.listDueReminders("web-user", new Date("2026-06-06T00:00:00.000Z"));

  assert.equal(calls.length, 1);
  const url = new URL(String(calls[0].input));
  assert.equal(url.searchParams.get("user_id"), "eq.web-user");
  assert.equal(url.searchParams.get("status"), "eq.pending");
  assert.equal(url.searchParams.get("target_time"), "lte.2026-06-06T00:00:00.000Z");
  assert.equal(url.searchParams.get("order"), "target_time.asc");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_example");
  assert.equal(calls[0].init.headers.Authorization, undefined);
}

async function verifyMarkReminderSent() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(null, { status: 200 });
  };

  const store = createSupabaseReminderStore(env);
  await store.markReminderSent("reminder-1", new Date("2026-06-06T00:00:00.000Z"));

  assert.equal(calls.length, 1);
  const url = new URL(String(calls[0].input));
  assert.equal(url.searchParams.get("id"), "eq.reminder-1");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers.Prefer, "return=minimal");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.status, "sent");
  assert.equal(body.sent_at, "2026-06-06T00:00:00.000Z");
  assert.equal(body.updated_at, "2026-06-06T00:00:00.000Z");
}

async function verifyCancelReminder() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(null, { status: 200 });
  };

  const store = createSupabaseReminderStore(env);
  await store.cancelReminder("reminder-1", new Date("2026-06-06T00:00:00.000Z"));

  assert.equal(calls.length, 1);
  const url = new URL(String(calls[0].input));
  assert.equal(url.searchParams.get("id"), "eq.reminder-1");
  assert.equal(url.searchParams.get("status"), "eq.pending");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.headers.Prefer, "return=minimal");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.status, "cancelled");
  assert.equal(body.updated_at, "2026-06-06T00:00:00.000Z");
}

main();
