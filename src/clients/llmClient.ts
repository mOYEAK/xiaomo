export interface LlmEnv {
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  complete(messages: LlmMessage[]): Promise<string>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface LlmClientOptions {
  timeoutMs?: number;
}

export function createOpenAiCompatibleLlmClient(
  env: LlmEnv,
  options: LlmClientOptions = {},
): LlmClient {
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL) {
    throw new Error("LLM is not configured.");
  }

  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL.replace(/\/+$/, "");
  const model = env.LLM_MODEL;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async complete(messages) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 1,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as ChatCompletionResponse;

        if (!response.ok) {
          throw new Error(
            `LLM request failed: ${payload.error?.message ?? response.statusText}`,
          );
        }

        const content = payload.choices?.[0]?.message?.content?.trim();

        if (!content) {
          throw new Error("LLM returned an empty response.");
        }

        return content;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("LLM request timed out.", { cause: error });
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
