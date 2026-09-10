import assert from "node:assert/strict";
import { routeMessage, runAgent } from "../dist/verify/core/agent/agent.js";
import { parseReminderRequest } from "../dist/verify/core/agent/reminderParser.js";
import { WebReaderError } from "../dist/verify/clients/webReader.js";

const now = new Date("2026-06-05T04:00:00.000Z");

async function main() {
  verifyRoutes();
  verifyReminderParsing();
  await verifyWebSummary();
  await verifyWebSummaryAccessRestriction();
  await verifyWebSummaryFailure();
  await verifyAgentChat();
  await verifyReminderDoesNotCallLlm();
  await verifyAgentReminderCreation();
  await verifyAgentReminderList();
  await verifyAgentReminderCancel();
  await verifyReminderFailure();

  console.log("Agent Core local verification passed.");
}

function verifyRoutes() {
  assert.equal(routeMessage("https://example.com/article"), "web_summary");
  assert.equal(routeMessage("明天 8 点提醒我带护照"), "reminder");
  assert.equal(routeMessage("查看提醒"), "reminder_list");
  assert.equal(routeMessage("取消提醒"), "reminder_cancel");
  assert.equal(routeMessage("记一下：护照放在书桌抽屉"), "memo_create");
  assert.equal(routeMessage("我之前把护照放哪了"), "memo_search");
  assert.equal(routeMessage("查看备忘录"), "memo_list");
  assert.equal(routeMessage("删除备忘录"), "memo_delete");
  assert.equal(routeMessage("明天上海天气怎么样"), "weather");
  assert.equal(routeMessage("帮我查一下最新消息"), "search");
  assert.equal(routeMessage("最近人工智能新闻"), "search");
  assert.equal(routeMessage("我最近很累"), "chat");
  assert.equal(routeMessage("你好"), "chat");
}

async function verifyWebSummary() {
  const llmCalls = [];
  const output = await runAgent(
    {
      userId: "web-user",
      text: "总结 https://example.com/article",
      channel: "web",
    },
    {
      llmClient: {
        async complete(messages) {
          llmCalls.push(messages);
          return "核心要点\n- 要点一\n\n简短结论\n这是结论。";
        },
      },
      webReader: {
        async read(url) {
          return {
            url,
            content: "这是网页正文。",
            truncated: false,
          };
        },
      },
    },
  );

  assert.equal(output.route, "web_summary");
  assert.match(output.reply, /核心要点/);
  assert.match(output.reply, /https:\/\/example\.com\/article/);
  assert.equal(llmCalls.length, 1);
  assert.match(llmCalls[0][1].content, /这是网页正文/);
}

async function verifyWebSummaryAccessRestriction() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "https://example.com/private",
      channel: "web",
    },
    {
      llmClient: {
        async complete() {
          return "unexpected";
        },
      },
      webReader: {
        async read() {
          throw new WebReaderError("login required", "access_restricted");
        },
      },
    },
  );

  assert.equal(output.route, "web_summary");
  assert.match(output.reply, /公开分享链接/);
  assert.match(output.reply, /粘贴/);
}

async function verifyWebSummaryFailure() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "https://example.com/private",
      channel: "web",
    },
    {
      llmClient: {
        async complete() {
          return "unexpected";
        },
      },
      webReader: {
        async read() {
          throw new Error("blocked");
        },
      },
    },
  );

  assert.equal(output.route, "web_summary");
  assert.match(output.reply, /无法读取或总结/);
}

async function verifyAgentChat() {
  const calls = [];
  const output = await runAgent(
    {
      userId: "web-user",
      text: "你好",
      channel: "web",
    },
    {
      llmClient: {
        async complete(messages) {
          calls.push(messages);
          return "你好，有什么可以帮你？";
        },
      },
    },
  );

  assert.equal(output.route, "chat");
  assert.equal(output.reply, "你好，有什么可以帮你？");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].content, "你好");
}

async function verifyReminderDoesNotCallLlm() {
  let llmCalls = 0;
  const output = await runAgent(
    {
      userId: "web-user",
      text: "明天 8 点提醒我带护照",
      channel: "web",
    },
    {
      now,
      llmClient: {
        async complete() {
          llmCalls += 1;
          return "unexpected";
        },
      },
      reminderStore: createMemoryReminderStore(),
    },
  );

  assert.equal(output.route, "reminder");
  assert.equal(llmCalls, 0);
}

function verifyReminderParsing() {
  const tomorrow = parseReminderRequest("明天 8 点提醒我带护照", now);
  assert.equal(tomorrow.ok, true);
  assert.equal(tomorrow.reminder.content, "带护照");
  assert.equal(tomorrow.reminder.targetTime, "2026-06-06T00:00:00.000Z");

  const tonight = parseReminderRequest("今晚 10 点提醒我交电费", now);
  assert.equal(tonight.ok, true);
  assert.equal(tonight.reminder.content, "交电费");
  assert.equal(tonight.reminder.targetTime, "2026-06-05T14:00:00.000Z");

  const nextMonday = parseReminderRequest("下周一上午 9 点提醒我开会", now);
  assert.equal(nextMonday.ok, true);
  assert.equal(nextMonday.reminder.content, "开会");
  assert.equal(nextMonday.reminder.targetTime, "2026-06-08T01:00:00.000Z");

  const missingTime = parseReminderRequest("提醒我带伞", now);
  assert.deepEqual(missingTime, { ok: false, reason: "missing_time" });

  const fiveMinutes = parseReminderRequest("5 分钟后提醒我测试提醒", now);
  assert.equal(fiveMinutes.ok, true);
  assert.equal(fiveMinutes.reminder.content, "测试提醒");
  assert.equal(fiveMinutes.reminder.targetTime, "2026-06-05T04:05:00.000Z");

  const twoHours = parseReminderRequest("两小时后提醒我出发", now);
  assert.equal(twoHours.ok, true);
  assert.equal(twoHours.reminder.content, "出发");
  assert.equal(twoHours.reminder.targetTime, "2026-06-05T06:00:00.000Z");
}

async function verifyAgentReminderCreation() {
  const created = [];
  const output = await runAgent(
    {
      userId: "web-user",
      text: "明天 8 点提醒我带护照",
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
  assert.match(output.reply, /带护照/);
  assert.equal(created.length, 1);
  assert.equal(created[0].userId, "web-user");
  assert.equal(created[0].reminder.targetTime, "2026-06-06T00:00:00.000Z");
}

async function verifyAgentReminderList() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "查看提醒",
      channel: "web",
    },
    {
      now,
      reminderStore: createMemoryReminderStore(),
    },
  );

  assert.equal(output.route, "reminder_list");
  assert.match(output.reply, /你的待提醒/);
  assert.match(output.reply, /带护照/);
}

async function verifyAgentReminderCancel() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "取消提醒",
      channel: "web",
    },
    {
      now,
      reminderStore: createMemoryReminderStore(),
    },
  );

  assert.equal(output.route, "reminder_cancel");
  assert.match(output.reply, /可取消/);
  assert.match(output.reply, /带护照/);
}

async function verifyReminderFailure() {
  const output = await runAgent(
    {
      userId: "web-user",
      text: "提醒我带伞",
      channel: "web",
    },
    { now },
  );

  assert.equal(output.route, "reminder");
  assert.match(output.reply, /具体时间/);
}

function createMemoryReminderStore() {
  return {
    async createReminder(userId, reminder) {
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
    async listReminders() {
      return [
        {
          id: "reminder-1",
          user_id: "web-user",
          content: "带护照",
          source_message: "明天 8 点提醒我带护照",
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
