export const DEFAULT_TIMEZONE = "Asia/Shanghai";

export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ShanghaiDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function getShanghaiParts(date: Date): ShanghaiDateParts {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);

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

export function fromShanghaiParts(parts: ShanghaiDateParts): Date {
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - SHANGHAI_OFFSET_MS,
  );
}

/**
 * 返回整体平移到上海时区的 Date，调用方需配合 UTC 访问器读取/修改。
 */
export function toShanghaiDate(now: Date): Date {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS);
}
