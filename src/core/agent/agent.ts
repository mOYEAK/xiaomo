import {
  formatReminderTime,
  parseReminderRequest,
  type ReminderParseResult,
} from "./reminderParser";
import {
  memoCreatePattern,
  routeMessage,
  type AgentChannel,
  type AgentRoute,
} from "./router";
import type { AgentRuntime } from "./runtime";
import {
  extractSearchQuery,
  resolveSearchTopic,
} from "../../clients/searchClient";
import { extractFirstUrl, WebReaderError } from "../../clients/webReader";
import {
  describeWeatherCode,
  extractWeatherLocation,
  formatWeatherLocation,
  resolveWeatherDate,
  type WeatherLocation,
} from "../../clients/weatherClient";
import { toSafeErrorMessage } from "../../lib/errors";

export type { AgentChannel, AgentRoute };
export { routeMessage };

export interface AgentInput {
  userId: string;
  text: string;
  channel: AgentChannel;
}

export interface AgentOutput {
  reply: string;
  route: AgentRoute;
}

export async function runAgent(
  input: AgentInput,
  runtime: AgentRuntime = {},
): Promise<AgentOutput> {
  const text = input.text.trim();

  if (!text) {
    return {
      route: "chat",
      reply: "你发来的内容是空的，可以直接输入想让我帮你处理的事情。",
    };
  }

  const route = routeMessage(text);

  switch (route) {
    case "reminder":
      return handleReminderRoute(input, runtime);
    case "reminder_list":
      return handleReminderListRoute(input, runtime);
    case "reminder_cancel":
      return handleReminderCancelRoute(input, runtime);
    case "memo_create":
    case "memo_list":
    case "memo_search":
    case "memo_delete":
      return handleMemoRoute(route, input, runtime);
    case "chat":
      return handleChatRoute(input, runtime);
    case "web_summary":
      return handleWebSummaryRoute(input, runtime);
    case "weather":
      return handleWeatherRoute(input, runtime);
    case "search":
      return handleSearchRoute(input, runtime);
  }
}

async function handleReminderRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
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
        "我已经识别到这是提醒，但还没有配置 Supabase 存储，所以暂时不能保存。请先配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。",
    };
  }

  const reminder = await runtime.reminderStore.createReminder(
    input.userId,
    parsed.reminder,
  );

  return {
    route: "reminder",
    reply: `好的，我会在 ${formatReminderTime(reminder.target_time)} 提醒你：${reminder.content}`,
  };
}

async function handleReminderListRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.reminderStore) {
    return {
      route: "reminder_list",
      reply: "提醒存储还没有配置，暂时不能查看提醒列表。",
    };
  }

  const reminders = await runtime.reminderStore.listReminders(
    input.userId,
    "pending",
  );

  if (!reminders.length) {
    return {
      route: "reminder_list",
      reply: "你现在没有待提醒的事。",
    };
  }

  const lines = reminders
    .slice(0, 10)
    .map(
      (reminder, index) =>
        `${index + 1}. ${formatReminderTime(reminder.target_time)} ${reminder.content}`,
    );

  return {
    route: "reminder_list",
    reply: `你的待提醒：\n${lines.join("\n")}`,
  };
}

async function handleReminderCancelRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.reminderStore) {
    return {
      route: "reminder_cancel",
      reply: "提醒存储还没有配置，暂时不能取消提醒。",
    };
  }

  const reminders = await runtime.reminderStore.listReminders(
    input.userId,
    "pending",
  );

  if (!reminders.length) {
    return {
      route: "reminder_cancel",
      reply: "你现在没有可取消的待提醒。",
    };
  }

  const lines = reminders
    .slice(0, 10)
    .map(
      (reminder, index) =>
        `${index + 1}. ${formatReminderTime(reminder.target_time)} ${reminder.content}`,
    );

  return {
    route: "reminder_cancel",
    reply: `下面是可取消的待提醒：\n${lines.join(
      "\n",
    )}\n\n请在右侧提醒列表里点“取消”。`,
  };
}

async function handleMemoRoute(
  route: "memo_create" | "memo_list" | "memo_search" | "memo_delete",
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.memoStore) {
    return { route, reply: "备忘录存储还没有配置，暂时无法使用。" };
  }

  try {
    if (route === "memo_create") {
      const content = input.text.match(memoCreatePattern)?.[1]?.trim();

      if (!content) {
        return {
          route,
          reply: "要记下什么内容？例如：记一下：护照放在书桌抽屉。",
        };
      }

      await runtime.memoStore.createMemo(input.userId, content, input.text);
      return { route, reply: `记下了：${content}` };
    }

    if (route === "memo_search") {
      const query = extractMemoQuery(input.text);
      const memos = query
        ? await runtime.memoStore.searchMemos(input.userId, query)
        : await runtime.memoStore.listMemos(input.userId);

      return {
        route,
        reply: memos.length
          ? `我找到这些相关备忘：\n${formatMemos(memos)}`
          : `没有找到${query ? `与“${query}”相关的` : ""}备忘。`,
      };
    }

    const memos = await runtime.memoStore.listMemos(input.userId);

    if (!memos.length) {
      return { route, reply: "你现在还没有备忘录。" };
    }

    return {
      route,
      reply:
        route === "memo_delete"
          ? `下面是可删除的备忘，请在右侧备忘录列表中点击“删除”：\n${formatMemos(memos)}`
          : `你的备忘录：\n${formatMemos(memos)}`,
    };
  } catch (error) {
    console.error("Memo operation failed.", {
      error: toSafeErrorMessage(error),
    });
    return {
      route,
      reply: "备忘录暂时无法使用，请确认 Supabase 已创建 memos 表后再试。",
    };
  }
}

function extractMemoQuery(text: string): string {
  const placedItem = text
    .match(/(?:我)?(?:之前|以前)?(?:把)?(.+?)放(?:在|到|哪)/)?.[1]
    ?.trim();

  if (placedItem) {
    return placedItem;
  }

  return text
    .replace(
      /(我|你)?(之前|以前)?(把|记得|记录|记下|备忘|查找|搜索|帮我|一下|吗|呢|哪儿|哪里|什么地方)/g,
      "",
    )
    .replace(/(放在|放到|放哪了|是什么|是啥|的记录)/g, "")
    .replace(/[？?。,.，！!\s]/g, "")
    .trim();
}

function formatMemos(memos: Array<{ content: string }>): string {
  return memos
    .slice(0, 10)
    .map((memo, index) => `${index + 1}. ${memo.content}`)
    .join("\n");
}

async function handleChatRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.llmClient) {
    return {
      route: "chat",
      reply:
        "普通对话还没有配置 LLM。请先配置 LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL。",
    };
  }

  try {
    const reply = await runtime.llmClient.complete([
      {
        role: "system",
        content:
          "你是一个中文个人生活助理。回答要准确、简洁、友好，并优先给出可执行的建议。不要声称已执行你没有工具能力完成的操作。",
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
      reply: "我暂时无法完成这次 AI 对话，请稍后再试。",
    };
  }
}

async function handleWebSummaryRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  const url = extractFirstUrl(input.text);

  if (!url) {
    return {
      route: "web_summary",
      reply:
        "我没有找到可读取的网页链接，请发送完整的 http:// 或 https:// 链接。",
    };
  }

  if (!runtime.webReader || !runtime.llmClient) {
    return {
      route: "web_summary",
      reply: "网页总结能力还没有完成配置，请稍后再试。",
    };
  }

  try {
    const document = await runtime.webReader.read(url);
    const truncationNote = document.truncated
      ? "\n\n注意：正文较长，以下内容是截断后的前半部分。"
      : "";
    const summary = await runtime.llmClient.complete([
      {
        role: "system",
        content:
          "你是中文网页信息整理助理。只根据提供的正文总结，不要编造。输出格式固定为：“核心要点”下列出 3-5 个简洁要点，然后输出“简短结论”一段。",
      },
      {
        role: "user",
        content: `请总结以下网页正文：\n\n${document.content}${truncationNote}`,
      },
    ]);

    return {
      route: "web_summary",
      reply: `${summary}\n\n原文链接：${document.url}`,
    };
  } catch (error) {
    console.error("Web summary failed.", {
      error: toSafeErrorMessage(error),
      url,
    });

    if (error instanceof WebReaderError && error.code === "access_restricted") {
      return {
        route: "web_summary",
        reply:
          "这个链接需要登录或受区域限制，我无法读取其中的正文。请发送公开分享链接，或直接粘贴需要总结的内容。",
      };
    }

    return {
      route: "web_summary",
      reply:
        "我暂时无法读取或总结这个网页。它可能需要登录、有访问限制，或网页服务暂时不可用。",
    };
  }
}

async function handleWeatherRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.weatherClient) {
    return {
      route: "weather",
      reply: "天气查询服务暂时没有配置好，请稍后再试。",
    };
  }

  try {
    const requestedLocation = extractWeatherLocation(input.text);
    let location: WeatherLocation | null = null;

    if (requestedLocation) {
      location = await runtime.weatherClient.findLocation(requestedLocation);

      if (!location) {
        return {
          route: "weather",
          reply: `我没有找到“${requestedLocation}”这个地点，请换一个城市名称再试。`,
        };
      }

      if (runtime.userPreferenceStore) {
        try {
          await runtime.userPreferenceStore.saveWeatherLocation(
            input.userId,
            location,
          );
        } catch (error) {
          console.error("Saving weather location failed.", {
            error: toSafeErrorMessage(error),
          });
        }
      }
    } else if (runtime.userPreferenceStore) {
      try {
        location = await runtime.userPreferenceStore.getWeatherLocation(
          input.userId,
        );
      } catch (error) {
        console.error("Reading weather location failed.", {
          error: toSafeErrorMessage(error),
        });
      }
    }

    if (!location) {
      return {
        route: "weather",
        reply: "你想查询哪个城市的天气？例如：明天上海天气怎么样。",
      };
    }

    const target = resolveWeatherDate(input.text, runtime.now);
    const forecast = await runtime.weatherClient.getDailyForecast(
      location,
      target.date,
    );

    if (!forecast) {
      return {
        route: "weather",
        reply: `暂时查不到 ${target.label}（${target.date}）的天气，当前只能查询未来 16 天内的预报。`,
      };
    }

    const condition = describeWeatherCode(forecast.weatherCode);
    const advice = buildWeatherAdvice(
      forecast.precipitationProbabilityMax,
      forecast.temperatureMin,
      forecast.temperatureMax,
      forecast.windSpeedMax,
    );

    return {
      route: "weather",
      reply: `${formatWeatherLocation(location)} ${target.label}（${forecast.date}）：${condition}，${round(
        forecast.temperatureMin,
      )}～${round(forecast.temperatureMax)}°C，最高降雨概率 ${round(
        forecast.precipitationProbabilityMax,
      )}%，最大风速 ${round(forecast.windSpeedMax)} km/h。\n${advice}`,
    };
  } catch (error) {
    console.error("Weather query failed.", {
      error: toSafeErrorMessage(error),
    });

    return {
      route: "weather",
      reply: "我暂时无法查询天气，天气服务可能正忙，请稍后再试。",
    };
  }
}

async function handleSearchRoute(
  input: AgentInput,
  runtime: AgentRuntime,
): Promise<AgentOutput> {
  if (!runtime.searchClient) {
    return {
      route: "search",
      reply: "联网搜索还没有配置 Tavily API Key，暂时无法搜索。",
    };
  }

  const query = extractSearchQuery(input.text);

  if (!query) {
    return {
      route: "search",
      reply: "你想搜索什么？可以这样说：帮我查一下最近的人工智能新闻。",
    };
  }

  try {
    const results = await runtime.searchClient.search(
      query,
      resolveSearchTopic(input.text),
    );

    if (!results.length) {
      return {
        route: "search",
        reply: `我没有找到与“${query}”相关的可靠搜索结果，可以换个关键词再试。`,
      };
    }

    if (!runtime.llmClient) {
      return {
        route: "search",
        reply: `搜索结果：\n${formatSearchSources(results)}`,
      };
    }

    const context = results
      .map(
        (result, index) =>
          `[${index + 1}] ${result.title}\n摘要：${result.content || "无摘要"}\n链接：${result.url}`,
      )
      .join("\n\n");
    const answer = await runtime.llmClient.complete([
      {
        role: "system",
        content:
          "你是中文联网搜索助理。只根据给定搜索结果回答，不要编造；信息不足或来源有冲突时必须明确说明。回答简洁，并使用 [1]、[2] 形式标注依据。",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n搜索结果：\n${context}`,
      },
    ]);

    return {
      route: "search",
      reply: `${answer}\n\n来源：\n${formatSearchSources(results)}`,
    };
  } catch (error) {
    console.error("Web search failed.", {
      error: toSafeErrorMessage(error),
    });

    return {
      route: "search",
      reply: "我暂时无法完成联网搜索，请稍后再试。",
    };
  }
}

function formatSearchSources(
  results: Array<{ title: string; url: string }>,
): string {
  return results
    .map((result, index) => `[${index + 1}] ${result.title}\n${result.url}`)
    .join("\n");
}

function buildWeatherAdvice(
  rain: number,
  min: number,
  max: number,
  wind: number,
): string {
  const advice: string[] = [];

  if (rain >= 50) advice.push("建议带伞");
  else if (rain >= 25) advice.push("有一定降雨可能，出门可备伞");
  if (min <= 10) advice.push("早晚偏冷，注意保暖");
  else if (max >= 32) advice.push("天气较热，注意防晒和补水");
  if (wind >= 40) advice.push("风力较大，注意出行安全");

  return advice.length
    ? `${advice.join("；")}。`
    : "天气较平稳，正常安排出行即可。";
}

function round(value: number): number {
  return Math.round(value);
}

function buildReminderParseFailureReply(
  parsed: ReminderParseResult & { ok: false },
): string {
  if (parsed.reason === "missing_content") {
    return "我看到了提醒时间，但还不知道要提醒你做什么。可以这样说：明天 8 点提醒我带护照。";
  }

  return "我还没有识别到具体时间。可以这样说：明天 8 点提醒我带护照。";
}
