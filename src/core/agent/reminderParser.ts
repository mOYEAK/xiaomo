import {
  DEFAULT_TIMEZONE,
  fromShanghaiParts,
  getShanghaiParts,
  type ShanghaiDateParts,
} from "../../lib/time";

export { DEFAULT_TIMEZONE };

export interface ParsedReminder {
  content: string;
  sourceMessage: string;
  targetTime: string;
  timezone: string;
}

export type ReminderParseResult =
  | { ok: true; reminder: ParsedReminder }
  | { ok: false; reason: "missing_time" | "missing_content" };

const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

const chineseDigits: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const weekdayDigits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

const triggerPattern = /(提醒我|提醒|记得|到时候)/;
const datePattern = /(今天|明天|后天|今晚|明早|明晚|下周[一二三四五六日天])/g;
const dateTestPattern =
  /(今天|明天|后天|今晚|明早|明晚|下周[一二三四五六日天])/;
const periodPattern = /(凌晨|早上|上午|中午|下午|晚上|今晚)/g;
const colonTimePattern = /([0-9]{1,2})\s*[:：]\s*([0-9]{1,2})/;
const pointTimePattern =
  /([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点|时)(?:\s*(半|([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*分?))?/;
const relativeTimePattern =
  /([0-9]{1,4}|[零〇一二两三四五六七八九十]{1,4})\s*(分钟|小时)\s*后/;

export function parseReminderRequest(
  text: string,
  now = new Date(),
): ReminderParseResult {
  const sourceMessage = text.trim();
  const relativeTime = parseRelativeTime(sourceMessage, now);

  if (relativeTime) {
    const content = extractReminderContent(sourceMessage);

    if (!content) {
      return { ok: false, reason: "missing_content" };
    }

    return {
      ok: true,
      reminder: {
        content,
        sourceMessage,
        targetTime: relativeTime.toISOString(),
        timezone: DEFAULT_TIMEZONE,
      },
    };
  }

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

  if (
    !hasExplicitDate(sourceMessage) &&
    targetTime.getTime() <= now.getTime()
  ) {
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

function parseRelativeTime(text: string, now: Date): Date | undefined {
  const match = text.match(relativeTimePattern);

  if (!match) {
    return undefined;
  }

  const amount = parseNumberToken(match[1]);

  if (!amount || amount < 1) {
    return undefined;
  }

  const durationMs =
    match[2] === "小时" ? amount * 60 * minuteMs : amount * minuteMs;
  return new Date(now.getTime() + durationMs);
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
  const minute =
    pointMatch[2] === "半" ? 30 : parseNumberToken(pointMatch[3] ?? "0");

  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) {
    return undefined;
  }

  return { hour, minute };
}

function parseNumberToken(token: string): number | undefined {
  if (/^[0-9]+$/.test(token)) {
    return Number(token);
  }

  if (token === "十") {
    return 10;
  }

  if (token.includes("十")) {
    const [left, right] = token.split("十");
    const tens = left ? chineseDigits[left] : 1;
    const ones = right ? chineseDigits[right] : 0;
    return tens === undefined || ones === undefined
      ? undefined
      : tens * 10 + ones;
  }

  return chineseDigits[token];
}

function resolveTargetDate(
  text: string,
  nowParts: ShanghaiDateParts,
): Pick<ShanghaiDateParts, "year" | "month" | "day"> {
  let dayOffset = 0;
  const nextWeekMatch = text.match(/下周([一二三四五六日天])/);

  if (nextWeekMatch) {
    const currentMondayIndex = (nowParts.weekday + 6) % 7;
    const targetWeekday = weekdayDigits[nextWeekMatch[1]];
    const targetMondayIndex = targetWeekday === 0 ? 6 : targetWeekday - 1;
    dayOffset = 7 - currentMondayIndex + targetMondayIndex;
  } else if (text.includes("后天")) {
    dayOffset = 2;
  } else if (
    text.includes("明天") ||
    text.includes("明早") ||
    text.includes("明晚")
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
    text.includes("下午") ||
    text.includes("晚上") ||
    text.includes("今晚") ||
    text.includes("明晚")
  ) {
    return hour === 12 ? 12 : hour + 12;
  }

  if (text.includes("中午") && hour < 11) {
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
    .replace(relativeTimePattern, "")
    .replace(triggerPattern, "")
    .replace(datePattern, "")
    .replace(periodPattern, "")
    .replace(/^[\s，。：:,.、]+|[\s，。：:,.、]+$/g, "")
    .trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
