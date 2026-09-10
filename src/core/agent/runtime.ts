import {
  hasLlmConfig,
  hasSearchConfig,
  hasSupabaseConfig,
  type AppEnv,
} from "../../config/env";
import {
  createOpenAiCompatibleLlmClient,
  type LlmClient,
} from "../../clients/llmClient";
import {
  createSupabaseMemoStore,
  type MemoStore,
} from "../../stores/memoStore";
import {
  createSupabaseReminderStore,
  type ReminderStore,
} from "../../stores/reminderStore";
import {
  createTavilySearchClient,
  type SearchClient,
} from "../../clients/searchClient";
import {
  createSupabaseUserPreferenceStore,
  type UserPreferenceStore,
} from "../../stores/userPreferenceStore";
import { createJinaWebReader, type WebReader } from "../../clients/webReader";
import {
  createOpenMeteoWeatherClient,
  type WeatherClient,
} from "../../clients/weatherClient";

export interface AgentRuntime {
  llmClient?: LlmClient;
  memoStore?: MemoStore;
  reminderStore?: ReminderStore;
  searchClient?: SearchClient;
  userPreferenceStore?: UserPreferenceStore;
  webReader?: WebReader;
  weatherClient?: WeatherClient;
  now?: Date;
}

export type AgentRuntimeEnv = AppEnv;

export function createAgentRuntime(env: AgentRuntimeEnv): AgentRuntime {
  const hasSupabase = hasSupabaseConfig(env);

  return {
    llmClient: hasLlmConfig(env)
      ? createOpenAiCompatibleLlmClient(env)
      : undefined,
    memoStore: hasSupabase ? createSupabaseMemoStore(env) : undefined,
    reminderStore: hasSupabase ? createSupabaseReminderStore(env) : undefined,
    searchClient: hasSearchConfig(env)
      ? createTavilySearchClient(env)
      : undefined,
    userPreferenceStore: hasSupabase
      ? createSupabaseUserPreferenceStore(env)
      : undefined,
    webReader: createJinaWebReader(),
    weatherClient: createOpenMeteoWeatherClient(),
  };
}
