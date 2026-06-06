import assert from "node:assert/strict";
import { routeMessage, runAgent } from "../dist/verify/agentCore.js";
import { parseReminderRequest } from "../dist/verify/reminderParser.js";

const now = new Date("2026-06-05T04:00:00.000Z");

async function main() {
  verifyRoutes();
  verifyReminderParsing();
  await verifyAgentReminderCreation();
  await verifyAgentReminderList();
  await verifyAgentReminderCancel();
  await verifyReminderFailure();

  console.log("Agent Core local verification passed.");
}

function verifyRoutes() {
  assert.equal(routeMessage("https://example.com/article"), "web_summary");
  assert.equal(routeMessage("\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167"), "reminder");
  assert.equal(routeMessage("\u67e5\u770b\u63d0\u9192"), "reminder_list");
  assert.equal(routeMessage("\u53d6\u6d88\u63d0\u9192"), "reminder_cancel");
  assert.equal(routeMessage("\u660e\u5929\u4e0a\u6d77\u5929\u6c14\u600e\u4e48\u6837"), "weather");
  assert.equal(routeMessage("\u5e2e\u6211\u67e5\u4e00\u4e0b\u6700\u65b0\u6d88\u606f"), "search");
  assert.equal(routeMessage("\u4f60\u597d"), "chat");
}

function verifyReminderParsing() {
  const tomorrow = parseReminderRequest(
    "\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167",
    now,
  );
  assert.equal(tomorrow.ok, true);
  assert.equal(tomorrow.reminder.content, "\u5e26\u62a4\u7167");
  assert.equal(tomorrow.reminder.targetTime, "2026-06-06T00:00:00.000Z");

  const tonight = parseReminderRequest(
    "\u4eca\u665a 10 \u70b9\u63d0\u9192\u6211\u4ea4\u7535\u8d39",
    now,
  );
  assert.equal(tonight.ok, true);
  assert.equal(tonight.reminder.content, "\u4ea4\u7535\u8d39");
  assert.equal(tonight.reminder.targetTime, "2026-06-05T14:00:00.000Z");

  const nextMonday = parseReminderRequest(
    "\u4e0b\u5468\u4e00\u4e0a\u5348 9 \u70b9\u63d0\u9192\u6211\u5f00\u4f1a",
    now,
  );
  assert.equal(nextMonday.ok, true);
  assert.equal(nextMonday.reminder.content, "\u5f00\u4f1a");
  assert.equal(nextMonday.reminder.targetTime, "2026-06-08T01:00:00.000Z");

  const missingTime = parseReminderRequest("\u63d0\u9192\u6211\u5e26\u4f1e", now);
  assert.deepEqual(missingTime, { ok: false, reason: "missing_time" });
}

async function verifyAgentReminderCreation() {
  const created = [];
  const output = await runAgent(
    {
      userId: "web-user",
      text: "\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167",
      channel: "web",
    },
    {
      now,
      reminderStore: {
        async createReminder(userId, reminder) {
          created.push({ userId, reminder });
          return {
            id: "reminder-1",
            user_id: userId,
            content: reminder.content,
            source_message: reminder.sourceMessage,
            target_time: reminder.targetTime,
            timezone: reminder.timezone,
            status: "pending",
            retry_count: 0,
          };
        },
        async listDueReminders() {
          return [];
        },
        async markReminderSent() {},
        async listReminders() {
          return [];
        },
        async cancelReminder() {},
      },
    },
  );

  assert.equal(output.route, "reminder");
  assert.match(output.reply, /\u5e26\u62a4\u7167/);
  assert.equal(created.length, 1);
  assert.equal(created[0].userId, "web-user");
  assert.equal(created[0].reminder.targetTime, "2026-06-06T00:00:00.000Z");
}

async function verifyAgentReminderList() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "\u67e5\u770b\u63d0\u9192",
      channel: "web",
    },
    {
      now,
      reminderStore: createMemoryReminderStore(),
    },
  );

  assert.equal(output.route, "reminder_list");
  assert.match(output.reply, /\u4f60\u7684\u5f85\u63d0\u9192/);
  assert.match(output.reply, /\u5e26\u62a4\u7167/);
}

async function verifyAgentReminderCancel() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "\u53d6\u6d88\u63d0\u9192",
      channel: "web",
    },
    {
      now,
      reminderStore: createMemoryReminderStore(),
    },
  );

  assert.equal(output.route, "reminder_cancel");
  assert.match(output.reply, /\u53ef\u53d6\u6d88/);
  assert.match(output.reply, /\u5e26\u62a4\u7167/);
}

async function verifyReminderFailure() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "\u63d0\u9192\u6211\u5e26\u4f1e",
      channel: "web",
    },
    { now },
  );

  assert.equal(output.route, "reminder");
  assert.match(output.reply, /\u5177\u4f53\u65f6\u95f4/);
}

function createMemoryReminderStore() {
  return {
    async createReminder() {
      throw new Error("Not used.");
    },
    async listReminders() {
      return [
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
      ];
    },
    async listDueReminders() {
      return [];
    },
    async markReminderSent() {},
    async cancelReminder() {},
  };
}

main();
