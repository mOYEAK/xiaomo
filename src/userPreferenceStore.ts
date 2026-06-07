import type { SupabaseEnv } from "./reminderStore";
import type { WeatherLocation } from "./weatherClient";

export interface UserPreferenceStore {
  getWeatherLocation(userId: string): Promise<WeatherLocation | null>;
  saveWeatherLocation(userId: string, location: WeatherLocation): Promise<void>;
}

interface PreferenceRecord {
  weather_location_name?: string | null;
  weather_latitude?: number | null;
  weather_longitude?: number | null;
  weather_timezone?: string | null;
}

export function createSupabaseUserPreferenceStore(env: SupabaseEnv): UserPreferenceStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    async getWeatherLocation(userId) {
      const url = new URL(`${baseUrl}/rest/v1/user_preferences`);
      url.searchParams.set(
        "select",
        "weather_location_name,weather_latitude,weather_longitude,weather_timezone",
      );
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("limit", "1");

      const response = await fetch(url, { headers: buildHeaders(serviceRoleKey) });
      const records = await readJsonResponse<PreferenceRecord[]>(response);
      const record = records[0];

      if (
        !record?.weather_location_name ||
        typeof record.weather_latitude !== "number" ||
        typeof record.weather_longitude !== "number"
      ) {
        return null;
      }

      return {
        name: record.weather_location_name,
        latitude: record.weather_latitude,
        longitude: record.weather_longitude,
        timezone: record.weather_timezone || "Asia/Shanghai",
      };
    },

    async saveWeatherLocation(userId, location) {
      const url = new URL(`${baseUrl}/rest/v1/user_preferences`);
      url.searchParams.set("on_conflict", "user_id");

      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(serviceRoleKey, "resolution=merge-duplicates,return=minimal"),
        body: JSON.stringify({
          user_id: userId,
          weather_location_name: location.name,
          weather_latitude: location.latitude,
          weather_longitude: location.longitude,
          weather_timezone: location.timezone,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        await throwSupabaseError(response);
      }
    },
  };
}

function buildHeaders(serviceRoleKey: string, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };

  if (serviceRoleKey.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await throwSupabaseError(response);
  }

  return (await response.json()) as T;
}

async function throwSupabaseError(response: Response): Promise<never> {
  let detail = response.statusText;

  try {
    const payload = (await response.json()) as { message?: string; error?: string; details?: string };
    detail = payload.message ?? payload.error ?? payload.details ?? detail;
  } catch {
    // Keep the status text.
  }

  throw new Error(`Supabase request failed: ${detail}`);
}
