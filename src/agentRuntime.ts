import type { AgentRuntime } from "./agentCore";
import {
  createOpenAiCompatibleLlmClient,
  hasLlmConfig,
  type LlmEnv,
} from "./llmClient";
import { createSupabaseMemoStore } from "./memoStore";
import {
  createSupabaseReminderStore,
  hasSupabaseConfig,
  type SupabaseEnv,
} from "./reminderStore";
import {
  createTavilySearchClient,
  hasSearchConfig,
  type SearchEnv,
} from "./searchClient";
import { createSupabaseUserPreferenceStore } from "./userPreferenceStore";
import { createJinaWebReader } from "./webReader";
import { createOpenMeteoWeatherClient } from "./weatherClient";

export interface AgentRuntimeEnv extends SupabaseEnv, LlmEnv, SearchEnv {}

export function createAgentRuntime(env: AgentRuntimeEnv): AgentRuntime {
  const hasSupabase = hasSupabaseConfig(env);

  return {
    llmClient: hasLlmConfig(env) ? createOpenAiCompatibleLlmClient(env) : undefined,
    memoStore: hasSupabase ? createSupabaseMemoStore(env) : undefined,
    reminderStore: hasSupabase ? createSupabaseReminderStore(env) : undefined,
    searchClient: hasSearchConfig(env) ? createTavilySearchClient(env) : undefined,
    userPreferenceStore: hasSupabase ? createSupabaseUserPreferenceStore(env) : undefined,
    webReader: createJinaWebReader(),
    weatherClient: createOpenMeteoWeatherClient(),
  };
}
