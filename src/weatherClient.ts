export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  admin1?: string;
}

export interface DailyWeather {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
}

export interface WeatherClient {
  findLocation(name: string): Promise<WeatherLocation | null>;
  getDailyForecast(location: WeatherLocation, date: string): Promise<DailyWeather | null>;
}

interface GeocodingResponse {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    country?: string;
    admin1?: string;
  }>;
}

interface ForecastResponse {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
}

export function createOpenMeteoWeatherClient(): WeatherClient {
  return {
    async findLocation(name) {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", name);
      url.searchParams.set("count", "1");
      url.searchParams.set("language", "zh");
      url.searchParams.set("format", "json");

      const response = await fetch(url);
      const payload = await readJson<GeocodingResponse>(response, "天气地点查询失败");
      const result = payload.results?.[0];

      if (
        !result?.name ||
        typeof result.latitude !== "number" ||
        typeof result.longitude !== "number"
      ) {
        return null;
      }

      return {
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone || "Asia/Shanghai",
        country: result.country,
        admin1: result.admin1,
      };
    },

    async getDailyForecast(location, date) {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(location.latitude));
      url.searchParams.set("longitude", String(location.longitude));
      url.searchParams.set(
        "daily",
        [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_probability_max",
          "wind_speed_10m_max",
        ].join(","),
      );
      url.searchParams.set("timezone", location.timezone);
      url.searchParams.set("forecast_days", "16");

      const response = await fetch(url);
      const payload = await readJson<ForecastResponse>(response, "天气预报查询失败");
      const index = payload.daily?.time?.indexOf(date) ?? -1;

      if (index < 0 || !payload.daily) {
        return null;
      }

      return {
        date,
        weatherCode: payload.daily.weather_code?.[index] ?? 0,
        temperatureMax: payload.daily.temperature_2m_max?.[index] ?? 0,
        temperatureMin: payload.daily.temperature_2m_min?.[index] ?? 0,
        precipitationProbabilityMax:
          payload.daily.precipitation_probability_max?.[index] ?? 0,
        windSpeedMax: payload.daily.wind_speed_10m_max?.[index] ?? 0,
      };
    },
  };
}

export function extractWeatherLocation(text: string): string | null {
  const cleaned = text
    .replace(/(帮我|请|查一下|查询|看看|看一下|告诉我)/g, "")
    .replace(/(今天|今日|明天|后天|本周末|这周末|周末)/g, "")
    .replace(/(天气怎么样|天气如何|天气|会不会下雨|会下雨吗|下雨吗|下雨|带伞吗|要不要带伞|带伞|冷不冷|热不热|降温吗|降温|气温|温度)/g, "")
    .replace(/[？?。,.，！!\s]/g, "")
    .replace(/^(在|的)+|(怎么样|如何|吗|呢|呀|啊)$/g, "")
    .trim();

  return cleaned || null;
}

export function resolveWeatherDate(text: string, now = new Date()): {
  date: string;
  label: string;
} {
  const base = toShanghaiDate(now);
  let offset = 0;
  let label = "今天";

  if (/后天/.test(text)) {
    offset = 2;
    label = "后天";
  } else if (/明天/.test(text)) {
    offset = 1;
    label = "明天";
  } else if (/(本周末|这周末|周末)/.test(text)) {
    const day = base.getUTCDay();
    offset = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
    label = "周末";
  }

  base.setUTCDate(base.getUTCDate() + offset);
  return {
    date: formatDate(base),
    label,
  };
}

export function describeWeatherCode(code: number): string {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "有毛毛雨";
  if (code >= 61 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "有阵雨";
  if (code >= 85 && code <= 86) return "有阵雪";
  if (code >= 95) return "有雷雨";
  return "天气状况未知";
}

export function formatWeatherLocation(location: WeatherLocation): string {
  return [...new Set([location.admin1, location.name].filter(isString))].join(" ");
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}

function toShanghaiDate(now: Date): Date {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function formatDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

async function readJson<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}
