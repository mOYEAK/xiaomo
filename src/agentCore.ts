import {
  formatReminderTime,
  parseReminderRequest,
  type ReminderParseResult,
} from "./reminderParser";
import type { LlmClient } from "./llmClient";
import type { ReminderStore } from "./reminderStore";
import { extractFirstUrl, type WebReader } from "./webReader";

export type AgentChannel = "web" | "mp" | "wecom";

export interface AgentInput {
  userId: string;
  text: string;
  channel: AgentChannel;
}

export interface AgentOutput {
  reply: string;
  route: AgentRoute;
}

export interface AgentRuntime {
  llmClient?: LlmClient;
  reminderStore?: ReminderStore;
  webReader?: WebReader;
  now?: Date;
}

export type AgentRoute =
  | "web_summary"
  | "reminder"
  | "reminder_list"
  | "reminder_cancel"
  | "weather"
  | "search"
  | "chat";

const urlPattern = /https?:\/\/[^\s]+/i;
const reminderListPattern = /(\u67e5\u770b|\u5217\u51fa|\u6709\u54ea\u4e9b|\u770b\u770b).*(\u63d0\u9192|\u5f85\u529e)|^\s*(\u6211\u7684)?\u63d0\u9192(\u5217\u8868)?\s*$/;
const reminderCancelPattern = /(\u53d6\u6d88|\u5220\u9664|\u5220\u6389).*\u63d0\u9192/;
const reminderTriggerPattern = /(\u63d0\u9192\u6211|\u63d0\u9192|\u8bb0\u5f97|\u5230\u65f6\u5019)/;
const reminderPattern =
  /(\u63d0\u9192\u6211|\u63d0\u9192|\u8bb0\u5f97|\u5230\u65f6\u5019|\u4eca\u665a|\u660e\u5929|\u540e\u5929|\u4e0b\u5468|\u4e0a\u5348|\u4e0b\u5348|\u665a\u4e0a|\u65e9\u4e0a|[0-9\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+\s*(\u70b9|\u65f6))/;
const weatherPattern =
  /(\u5929\u6c14|\u4e0b\u96e8|\u5e26\u4f1e|\u51b7\u4e0d\u51b7|\u70ed\u4e0d\u70ed|\u964d\u6e29|\u6c14\u6e29|\u6e29\u5ea6)/;
const searchPattern =
  /(\u67e5\u4e00\u4e0b|\u641c\u4e00\u4e0b|\u641c\u7d22|\u6700\u65b0|\u7f51\u4e0a\u600e\u4e48\u8bf4|\u5e2e\u6211\u67e5|\u8d44\u6599)/;

export async function runAgent(input: AgentInput, runtime: AgentRuntime = {}): Promise<AgentOutput> {
  const text = input.text.trim();

  if (!text) {
    return {
      route: "chat",
      reply: "\u4f60\u53d1\u6765\u7684\u5185\u5bb9\u662f\u7a7a\u7684\uff0c\u53ef\u4ee5\u76f4\u63a5\u8f93\u5165\u60f3\u8ba9\u6211\u5e2e\u4f60\u5904\u7406\u7684\u4e8b\u60c5\u3002",
    };
  }

  const route = routeMessage(text);

  if (route === "reminder") {
    return handleReminderRoute(input, runtime);
  }

  if (route === "reminder_list") {
    return handleReminderListRoute(input, runtime);
  }

  if (route === "reminder_cancel") {
    return handleReminderCancelRoute(input, runtime);
  }

  if (route === "chat") {
    return handleChatRoute(input, runtime);
  }

  if (route === "web_summary") {
    return handleWebSummaryRoute(input, runtime);
  }

  return {
    route,
    reply: buildPlaceholderReply(route, text),
  };
}

export function routeMessage(text: string): AgentRoute {
  if (urlPattern.test(text)) {
    return "web_summary";
  }

  if (reminderCancelPattern.test(text)) {
    return "reminder_cancel";
  }

  if (reminderListPattern.test(text)) {
    return "reminder_list";
  }

  if (reminderTriggerPattern.test(text)) {
    return "reminder";
  }

  if (weatherPattern.test(text)) {
    return "weather";
  }

  if (reminderPattern.test(text)) {
    return "reminder";
  }

  if (searchPattern.test(text)) {
    return "search";
  }

  return "chat";
}

async function handleReminderRoute(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput> {
  const parsed = parseReminderRequest(input.text, runtime.now);

  if (!parsed.ok) {
    return {
      route: "reminder",
      reply: buildReminderParseFailureReply(parsed),
    };
  }

  if (!runtime.reminderStore) {
    return {
      route: "reminder",
      reply:
        "\u6211\u5df2\u7ecf\u8bc6\u522b\u5230\u8fd9\u662f\u63d0\u9192\uff0c\u4f46\u8fd8\u6ca1\u6709\u914d\u7f6e Supabase \u5b58\u50a8\uff0c\u6240\u4ee5\u6682\u65f6\u4e0d\u80fd\u4fdd\u5b58\u3002\u8bf7\u5148\u914d\u7f6e SUPABASE_URL \u548c SUPABASE_SERVICE_ROLE_KEY\u3002",
    };
  }

  const reminder = await runtime.reminderStore.createReminder(input.userId, parsed.reminder);

  return {
    route: "reminder",
    reply: `\u597d\u7684\uff0c\u6211\u4f1a\u5728 ${formatReminderTime(reminder.target_time)} \u63d0\u9192\u4f60\uff1a${reminder.content}`,
  };
}

async function handleReminderListRoute(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput> {
  if (!runtime.reminderStore) {
    return {
      route: "reminder_list",
      reply:
        "\u63d0\u9192\u5b58\u50a8\u8fd8\u6ca1\u6709\u914d\u7f6e\uff0c\u6682\u65f6\u4e0d\u80fd\u67e5\u770b\u63d0\u9192\u5217\u8868\u3002",
    };
  }

  const reminders = await runtime.reminderStore.listReminders(input.userId, "pending");

  if (!reminders.length) {
    return {
      route: "reminder_list",
      reply: "\u4f60\u73b0\u5728\u6ca1\u6709\u5f85\u63d0\u9192\u7684\u4e8b\u3002",
    };
  }

  const lines = reminders
    .slice(0, 10)
    .map((reminder, index) => `${index + 1}. ${formatReminderTime(reminder.target_time)} ${reminder.content}`);

  return {
    route: "reminder_list",
    reply: `\u4f60\u7684\u5f85\u63d0\u9192\uff1a\n${lines.join("\n")}`,
  };
}

async function handleReminderCancelRoute(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput> {
  if (!runtime.reminderStore) {
    return {
      route: "reminder_cancel",
      reply:
        "\u63d0\u9192\u5b58\u50a8\u8fd8\u6ca1\u6709\u914d\u7f6e\uff0c\u6682\u65f6\u4e0d\u80fd\u53d6\u6d88\u63d0\u9192\u3002",
    };
  }

  const reminders = await runtime.reminderStore.listReminders(input.userId, "pending");

  if (!reminders.length) {
    return {
      route: "reminder_cancel",
      reply: "\u4f60\u73b0\u5728\u6ca1\u6709\u53ef\u53d6\u6d88\u7684\u5f85\u63d0\u9192\u3002",
    };
  }

  const lines = reminders
    .slice(0, 10)
    .map((reminder, index) => `${index + 1}. ${formatReminderTime(reminder.target_time)} ${reminder.content}`);

  return {
    route: "reminder_cancel",
    reply: `\u4e0b\u9762\u662f\u53ef\u53d6\u6d88\u7684\u5f85\u63d0\u9192\uff1a\n${lines.join(
      "\n",
    )}\n\n\u8bf7\u5728\u53f3\u4fa7\u63d0\u9192\u5217\u8868\u91cc\u70b9\u201c\u53d6\u6d88\u201d\u3002`,
  };
}

async function handleChatRoute(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput> {
  if (!runtime.llmClient) {
    return {
      route: "chat",
      reply:
        "\u666e\u901a\u5bf9\u8bdd\u8fd8\u6ca1\u6709\u914d\u7f6e LLM\u3002\u8bf7\u5148\u914d\u7f6e LLM_API_KEY\u3001LLM_BASE_URL \u548c LLM_MODEL\u3002",
    };
  }

  try {
    const reply = await runtime.llmClient.complete([
      {
        role: "system",
        content:
          "\u4f60\u662f\u4e00\u4e2a\u4e2d\u6587\u4e2a\u4eba\u751f\u6d3b\u52a9\u7406\u3002\u56de\u7b54\u8981\u51c6\u786e\u3001\u7b80\u6d01\u3001\u53cb\u597d\uff0c\u5e76\u4f18\u5148\u7ed9\u51fa\u53ef\u6267\u884c\u7684\u5efa\u8bae\u3002\u4e0d\u8981\u58f0\u79f0\u5df2\u6267\u884c\u4f60\u6ca1\u6709\u5de5\u5177\u80fd\u529b\u5b8c\u6210\u7684\u64cd\u4f5c\u3002",
      },
      {
        role: "user",
        content: input.text.trim(),
      },
    ]);

    return {
      route: "chat",
      reply,
    };
  } catch (error) {
    console.error("LLM chat failed.", {
      error: toSafeErrorMessage(error),
    });

    return {
      route: "chat",
      reply:
        "\u6211\u6682\u65f6\u65e0\u6cd5\u5b8c\u6210\u8fd9\u6b21 AI \u5bf9\u8bdd\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",
    };
  }
}

async function handleWebSummaryRoute(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput> {
  const url = extractFirstUrl(input.text);

  if (!url) {
    return {
      route: "web_summary",
      reply: "\u6211\u6ca1\u6709\u627e\u5230\u53ef\u8bfb\u53d6\u7684\u7f51\u9875\u94fe\u63a5\uff0c\u8bf7\u53d1\u9001\u5b8c\u6574\u7684 http:// \u6216 https:// \u94fe\u63a5\u3002",
    };
  }

  if (!runtime.webReader || !runtime.llmClient) {
    return {
      route: "web_summary",
      reply:
        "\u7f51\u9875\u603b\u7ed3\u80fd\u529b\u8fd8\u6ca1\u6709\u5b8c\u6210\u914d\u7f6e\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002",
    };
  }

  try {
    const document = await runtime.webReader.read(url);
    const truncationNote = document.truncated
      ? "\n\n\u6ce8\u610f\uff1a\u6b63\u6587\u8f83\u957f\uff0c\u4ee5\u4e0b\u5185\u5bb9\u662f\u622a\u65ad\u540e\u7684\u524d\u534a\u90e8\u5206\u3002"
      : "";
    const summary = await runtime.llmClient.complete([
      {
        role: "system",
        content:
          "\u4f60\u662f\u4e00\u4e2a\u4e2d\u6587\u7f51\u9875\u4fe1\u606f\u6574\u7406\u52a9\u7406\u3002\u53ea\u6839\u636e\u63d0\u4f9b\u7684\u6b63\u6587\u603b\u7ed3\uff0c\u4e0d\u8981\u7f16\u9020\u3002\u8f93\u51fa\u683c\u5f0f\u56fa\u5b9a\u4e3a\uff1a\u201c\u6838\u5fc3\u8981\u70b9\u201d\u4e0b\u5217\u51fa 3-5 \u4e2a\u7b80\u6d01\u8981\u70b9\uff0c\u7136\u540e\u8f93\u51fa\u201c\u7b80\u77ed\u7ed3\u8bba\u201d\u4e00\u6bb5\u3002",
      },
      {
        role: "user",
        content: `\u8bf7\u603b\u7ed3\u4ee5\u4e0b\u7f51\u9875\u6b63\u6587\uff1a\n\n${document.content}${truncationNote}`,
      },
    ]);

    return {
      route: "web_summary",
      reply: `${summary}\n\n\u539f\u6587\u94fe\u63a5\uff1a${document.url}`,
    };
  } catch (error) {
    console.error("Web summary failed.", {
      error: toSafeErrorMessage(error),
      url,
    });

    return {
      route: "web_summary",
      reply:
        "\u6211\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u6216\u603b\u7ed3\u8fd9\u4e2a\u7f51\u9875\u3002\u5b83\u53ef\u80fd\u9700\u8981\u767b\u5f55\u3001\u6709\u8bbf\u95ee\u9650\u5236\uff0c\u6216\u7f51\u9875\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\u3002",
    };
  }
}

function buildReminderParseFailureReply(parsed: ReminderParseResult & { ok: false }): string {
  if (parsed.reason === "missing_content") {
    return "\u6211\u770b\u5230\u4e86\u63d0\u9192\u65f6\u95f4\uff0c\u4f46\u8fd8\u4e0d\u77e5\u9053\u8981\u63d0\u9192\u4f60\u505a\u4ec0\u4e48\u3002\u53ef\u4ee5\u8fd9\u6837\u8bf4\uff1a\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167\u3002";
  }

  return "\u6211\u8fd8\u6ca1\u6709\u8bc6\u522b\u5230\u5177\u4f53\u65f6\u95f4\u3002\u53ef\u4ee5\u8fd9\u6837\u8bf4\uff1a\u660e\u5929 8 \u70b9\u63d0\u9192\u6211\u5e26\u62a4\u7167\u3002";
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildPlaceholderReply(route: AgentRoute, text: string): string {
  switch (route) {
    case "web_summary":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u4e00\u6761\u7f51\u9875\u94fe\u63a5\u8bf7\u6c42\u3002\u4e0b\u4e00\u6b65\u4f1a\u63a5\u5165 Jina Reader \u548c LLM \u505a\u7f51\u9875\u603b\u7ed3\u3002";
    case "reminder":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u4e00\u4e2a\u63d0\u9192\u8bf7\u6c42\u3002";
    case "reminder_list":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u67e5\u770b\u63d0\u9192\u5217\u8868\u7684\u8bf7\u6c42\u3002";
    case "reminder_cancel":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u53d6\u6d88\u63d0\u9192\u7684\u8bf7\u6c42\u3002";
    case "weather":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u4e00\u4e2a\u5929\u6c14\u67e5\u8be2\u8bf7\u6c42\u3002\u4e0b\u4e00\u6b65\u4f1a\u63a5\u5165\u5929\u6c14 API\uff0c\u5e76\u7ed9\u51fa\u6e29\u5ea6\u3001\u964d\u96e8\u548c\u51fa\u95e8\u5efa\u8bae\u3002";
    case "search":
      return "\u6211\u8bc6\u522b\u5230\u8fd9\u662f\u4e00\u4e2a\u8054\u7f51\u641c\u7d22\u8bf7\u6c42\u3002\u4e0b\u4e00\u6b65\u4f1a\u63a5\u5165\u641c\u7d22 API\uff0c\u6574\u7406 Top 3 \u7ed3\u679c\u5e76\u9644\u6765\u6e90\u3002";
    case "chat":
      return `\u6536\u5230\uff1a${text}\n\nAgent Core \u5df2\u7ecf\u63a5\u901a\u3002\u4e0b\u4e00\u6b65\u4f1a\u63a5\u5165\u771f\u5b9e LLM \u751f\u6210\u66f4\u81ea\u7136\u7684\u56de\u590d\u3002`;
  }
}
