import assert from "node:assert/strict";
import { runAgent } from "../dist/verify/core/agent/agent.js";
import { createSupabaseUserPreferenceStore } from "../dist/verify/stores/userPreferenceStore.js";
import {
  createOpenMeteoWeatherClient,
  extractWeatherLocation,
  resolveWeatherDate,
} from "../dist/verify/clients/weatherClient.js";

const now = new Date("2026-06-06T04:00:00.000Z");

async function main() {
  verifyParsing();
  await verifyOpenMeteoClient();
  await verifyWeatherWithExplicitLocation();
  await verifyRememberedLocation();
  await verifyMissingAndInvalidLocation();
  await verifyPreferenceStore();
  await verifyWeatherFailure();
  console.log("Weather local verification passed.");
}

function verifyParsing() {
  assert.equal(extractWeatherLocation("明天上海天气怎么样"), "上海");
  assert.equal(extractWeatherLocation("北京会下雨吗"), "北京");
  assert.equal(extractWeatherLocation("今天天气怎么样"), null);
  assert.deepEqual(resolveWeatherDate("明天天气", now), {
    date: "2026-06-07",
    label: "明天",
  });
  assert.deepEqual(resolveWeatherDate("周末天气", now), {
    date: "2026-06-06",
    label: "周末",
  });
}

async function verifyOpenMeteoClient() {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);

    if (url.hostname === "geocoding-api.open-meteo.com") {
      return Response.json({
        results: [
          {
            name: "上海",
            latitude: 31.22,
            longitude: 121.46,
            timezone: "Asia/Shanghai",
            country: "中国",
            admin1: "上海",
          },
        ],
      });
    }

    return Response.json({
      daily: {
        time: ["2026-06-06"],
        weather_code: [61],
        temperature_2m_max: [28.4],
        temperature_2m_min: [21.2],
        precipitation_probability_max: [70],
        wind_speed_10m_max: [18],
      },
    });
  };

  const client = createOpenMeteoWeatherClient();
  const location = await client.findLocation("上海");
  const forecast = await client.getDailyForecast(location, "2026-06-06");

  assert.equal(location.name, "上海");
  assert.equal(forecast.weatherCode, 61);
  assert.equal(calls[0].searchParams.get("language"), "zh");
  assert.equal(calls[1].searchParams.get("forecast_days"), "16");
}

async function verifyWeatherWithExplicitLocation() {
  const saved = [];
  const output = await runAgent(
    { userId: "web-user", text: "明天上海天气怎么样", channel: "web" },
    {
      now,
      weatherClient: createMemoryWeatherClient(),
      userPreferenceStore: {
        async getWeatherLocation() {
          return null;
        },
        async saveWeatherLocation(userId, location) {
          saved.push({ userId, location });
        },
      },
    },
  );

  assert.equal(output.route, "weather");
  assert.match(output.reply, /上海/);
  assert.match(output.reply, /建议带伞/);
  assert.equal(saved.length, 1);
}

async function verifyRememberedLocation() {
  const output = await runAgent(
    { userId: "web-user", text: "今天天气怎么样", channel: "web" },
    {
      now,
      weatherClient: createMemoryWeatherClient(),
      userPreferenceStore: {
        async getWeatherLocation() {
          return sampleLocation();
        },
        async saveWeatherLocation() {},
      },
    },
  );

  assert.match(output.reply, /上海/);
}

async function verifyMissingAndInvalidLocation() {
  const missing = await runAgent(
    { userId: "web-user", text: "今天天气怎么样", channel: "web" },
    { now, weatherClient: createMemoryWeatherClient() },
  );
  assert.match(missing.reply, /哪个城市/);

  const invalid = await runAgent(
    { userId: "web-user", text: "明天不存在城天气怎么样", channel: "web" },
    {
      now,
      weatherClient: {
        async findLocation() {
          return null;
        },
        async getDailyForecast() {
          return null;
        },
      },
    },
  );
  assert.match(invalid.reply, /没有找到/);
}

async function verifyPreferenceStore() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    if (init.method === "POST") return new Response(null, { status: 201 });
    return Response.json([
      {
        weather_location_name: "上海",
        weather_latitude: 31.22,
        weather_longitude: 121.46,
        weather_timezone: "Asia/Shanghai",
      },
    ]);
  };

  const store = createSupabaseUserPreferenceStore({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
  });
  const location = await store.getWeatherLocation("web-user");
  await store.saveWeatherLocation("web-user", location);

  assert.equal(location.name, "上海");
  assert.match(String(calls[0].input), /user_preferences/);
  assert.equal(
    calls[1].init.headers.Prefer,
    "resolution=merge-duplicates,return=minimal",
  );
  assert.equal(JSON.parse(calls[1].init.body).user_id, "web-user");
}

async function verifyWeatherFailure() {
  const output = await runAgent(
    { userId: "web-user", text: "上海天气", channel: "web" },
    {
      weatherClient: {
        async findLocation() {
          throw new Error("offline");
        },
        async getDailyForecast() {
          return null;
        },
      },
    },
  );
  assert.match(output.reply, /暂时无法查询天气/);
}

function sampleLocation() {
  return {
    name: "上海",
    latitude: 31.22,
    longitude: 121.46,
    timezone: "Asia/Shanghai",
    admin1: "上海",
  };
}

function createMemoryWeatherClient() {
  return {
    async findLocation() {
      return sampleLocation();
    },
    async getDailyForecast(location, date) {
      return {
        date,
        weatherCode: 61,
        temperatureMax: 28,
        temperatureMin: 21,
        precipitationProbabilityMax: 70,
        windSpeedMax: 18,
      };
    },
  };
}

main();
