import {
  createSupabaseRestClient,
  type SupabaseEnv,
  type SupabaseRestClient,
} from "../clients/supabase";
import { DEFAULT_TIMEZONE } from "../lib/time";
import type { WeatherLocation } from "../clients/weatherClient";

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

export function createSupabaseUserPreferenceStore(
  env: SupabaseEnv,
): UserPreferenceStore {
  return createUserPreferenceStore(createSupabaseRestClient(env));
}

export function createUserPreferenceStore(
  rest: SupabaseRestClient,
): UserPreferenceStore {
  return {
    async getWeatherLocation(userId) {
      const url = rest.createUrl("user_preferences");
      url.searchParams.set(
        "select",
        "weather_location_name,weather_latitude,weather_longitude,weather_timezone",
      );
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("limit", "1");

      const records = await rest.fetchJson<PreferenceRecord[]>(url);
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
        timezone: record.weather_timezone || DEFAULT_TIMEZONE,
      };
    },

    async saveWeatherLocation(userId, location) {
      const url = rest.createUrl("user_preferences");
      url.searchParams.set("on_conflict", "user_id");

      await rest.fetchVoid(url, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: JSON.stringify({
          user_id: userId,
          weather_location_name: location.name,
          weather_latitude: location.latitude,
          weather_longitude: location.longitude,
          weather_timezone: location.timezone,
          updated_at: new Date().toISOString(),
        }),
      });
    },
  };
}
