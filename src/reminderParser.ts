export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export interface ParsedReminder {
  content: string;
  sourceMessage: string;
  targetTime: string;
  timezone: string;
}

export type ReminderParseResult =
  | { ok: true; reminder: ParsedReminder }
  | { ok: false; reason: "missing_time" | "missing_content" };

interface ShanghaiDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

const chineseDigits: Record<string, number> = {
  "\u96f6": 0,
  "\u3007": 0,
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e24": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9,
};

const weekdayDigits: Record<string, number> = {
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u65e5": 0,
  "\u5929": 0,
};

const triggerPattern = /(\u63d0\u9192\u6211|\u63d0\u9192|\u8bb0\u5f97|\u5230\u65f6\u5019)/g;
const datePattern =
  /(\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u4eca\u665a|\u660e\u65e9|\u660e\u665a|\u4e0b\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/g;
const dateTestPattern =
  /(\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u4eca\u665a|\u660e\u65e9|\u660e\u665a|\u4e0b\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/;
const periodPattern = /(\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a|\u4eca\u665a)/g;
const colonTimePattern = /([0-9]{1,2})\s*[:\uff1a]\s*([0-9]{1,2})/;
const pointTimePattern =
  /([0-9]{1,2}|[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,3})\s*(?:\u70b9|\u65f6)(?:\s*(\u534a|([0-9]{1,2}|[\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,3})\s*\u5206?))?/;

export function parseReminderRequest(text: string, now = new Date()): ReminderParseResult {
  const sourceMessage = text.trim();
  const time = parseTime(sourceMessage);

  if (!time) {
    return { ok: false, reason: "missing_time" };
  }

  const nowParts = getShanghaiParts(now);
  const targetDate = resolveTargetDate(sourceMessage, nowParts);
  const targetHour = adjustHourByPeriod(sourceMessage, time.hour);
  const targetMinute = time.minute;
  let targetTime = fromShanghaiParts({
    ...targetDate,
    hour: targetHour,
    minute: targetMinute,
    second: 0,
    weekday: 0,
  });

  if (!hasExplicitDate(sourceMessage) && targetTime.getTime() <= now.getTime()) {
    targetTime = new Date(targetTime.getTime() + dayMs);
  }

  const content = extractReminderContent(sourceMessage);

  if (!content) {
    return { ok: false, reason: "missing_content" };
  }

  return {
    ok: true,
    reminder: {
      content,
      sourceMessage,
      targetTime: targetTime.toISOString(),
      timezone: DEFAULT_TIMEZONE,
    },
  };
}

export function formatReminderTime(isoTime: string): string {
  const parts = getShanghaiParts(new Date(isoTime));
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function parseTime(text: string): { hour: number; minute: number } | undefined {
  const colonMatch = text.match(colonTimePattern);

  if (colonMatch) {
    return {
      hour: Number(colonMatch[1]),
      minute: Number(colonMatch[2]),
    };
  }

  const pointMatch = text.match(pointTimePattern);

  if (!pointMatch) {
    return undefined;
  }

  const hour = parseNumberToken(pointMatch[1]);
  const minute = pointMatch[2] === "\u534a" ? 30 : parseNumberToken(pointMatch[3] ?? "0");

  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) {
    return undefined;
  }

  return { hour, minute };
}

function parseNumberToken(token: string): number | undefined {
  if (/^[0-9]+$/.test(token)) {
    return Number(token);
  }

  if (token === "\u5341") {
    return 10;
  }

  if (token.includes("\u5341")) {
    const [left, right] = token.split("\u5341");
    const tens = left ? chineseDigits[left] : 1;
    const ones = right ? chineseDigits[right] : 0;
    return tens === undefined || ones === undefined ? undefined : tens * 10 + ones;
  }

  return chineseDigits[token];
}

function resolveTargetDate(text: string, nowParts: ShanghaiDateParts): Pick<ShanghaiDateParts, "year" | "month" | "day"> {
  let dayOffset = 0;
  const nextWeekMatch = text.match(/\u4e0b\u5468([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/);

  if (nextWeekMatch) {
    const currentMondayIndex = (nowParts.weekday + 6) % 7;
    const targetWeekday = weekdayDigits[nextWeekMatch[1]];
    const targetMondayIndex = targetWeekday === 0 ? 6 : targetWeekday - 1;
    dayOffset = 7 - currentMondayIndex + targetMondayIndex;
  } else if (text.includes("\u540e\u5929")) {
    dayOffset = 2;
  } else if (
    text.includes("\u660e\u5929") ||
    text.includes("\u660e\u65e9") ||
    text.includes("\u660e\u665a")
  ) {
    dayOffset = 1;
  }

  const base = fromShanghaiParts(nowParts);
  const target = new Date(base.getTime() + dayOffset * dayMs);
  const targetParts = getShanghaiParts(target);

  return {
    year: targetParts.year,
    month: targetParts.month,
    day: targetParts.day,
  };
}

function adjustHourByPeriod(text: string, hour: number): number {
  if (hour > 12) {
    return hour;
  }

  if (
    text.includes("\u4e0b\u5348") ||
    text.includes("\u665a\u4e0a") ||
    text.includes("\u4eca\u665a") ||
    text.includes("\u660e\u665a")
  ) {
    return hour === 12 ? 12 : hour + 12;
  }

  if (text.includes("\u4e2d\u5348") && hour < 11) {
    return hour + 12;
  }

  return hour;
}

function hasExplicitDate(text: string): boolean {
  return dateTestPattern.test(text);
}

function extractReminderContent(text: string): string {
  return text
    .replace(colonTimePattern, "")
    .replace(pointTimePattern, "")
    .replace(triggerPattern, "")
    .replace(datePattern, "")
    .replace(periodPattern, "")
    .replace(/^[\s\uff0c\u3002\uff1a:,\.\u3001]+|[\s\uff0c\u3002\uff1a:,\.\u3001]+$/g, "")
    .trim();
}

function getShanghaiParts(date: Date): ShanghaiDateParts {
  const shifted = new Date(date.getTime() + shanghaiOffsetMs);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

function fromShanghaiParts(parts: ShanghaiDateParts): Date {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
      shanghaiOffsetMs,
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
