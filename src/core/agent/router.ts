export type AgentChannel = "web" | "mp" | "wecom";

export type AgentRoute =
  | "web_summary"
  | "reminder"
  | "reminder_list"
  | "reminder_cancel"
  | "memo_create"
  | "memo_list"
  | "memo_search"
  | "memo_delete"
  | "weather"
  | "search"
  | "chat";

const urlPattern = /https?:\/\/[^\s]+/i;
const reminderListPattern =
  /(查看|列出|有哪些|看看).*(提醒|待办)|^\s*(我的)?提醒(列表)?\s*$/;
const reminderCancelPattern = /(取消|删除|删掉).*提醒/;
const reminderTriggerPattern = /(提醒我|提醒|记得|到时候)/;
const memoDeletePattern = /(删除|删掉|取消).*(备忘|记录)/;
const memoListPattern =
  /(查看|列出|看看).*(备忘|记录)|^\s*(我的)?备忘(录)?\s*$/;
const memoSearchPattern =
  /(之前|以前|记得).*(哪|什么|放|是)|(查找|搜索).*(备忘|记录)/;
export const memoCreatePattern =
  /^(?:请)?(?:帮我)?(?:记一下|记住|备忘)[：:,，\s]*(.+)$/;
const reminderPattern =
  /(提醒我|提醒|记得|到时候|今晚|明天|后天|下周|上午|下午|晚上|早上|[0-9零〇一二两三四五六七八九十]+\s*(点|时))/;
const weatherPattern = /(天气|下雨|带伞|冷不冷|热不热|降温|气温|温度)/;
const searchPattern =
  /(查一下|搜一下|搜索|最新|最近.*(新闻|消息|进展|情况)|新闻|网上怎么说|帮我查|资料)/;

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

  if (memoDeletePattern.test(text)) {
    return "memo_delete";
  }

  if (memoListPattern.test(text)) {
    return "memo_list";
  }

  if (memoCreatePattern.test(text)) {
    return "memo_create";
  }

  if (memoSearchPattern.test(text)) {
    return "memo_search";
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
