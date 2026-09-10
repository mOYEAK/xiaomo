export interface SearchEnv {
  TAVILY_API_KEY?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchClient {
  search(query: string, topic: "general" | "news"): Promise<SearchResult[]>;
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
  detail?: {
    error?: string;
  };
}

export function createTavilySearchClient(env: SearchEnv): SearchClient {
  if (!env.TAVILY_API_KEY) {
    throw new Error("Tavily search is not configured.");
  }

  const apiKey = env.TAVILY_API_KEY;

  return {
    async search(query, topic) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          topic,
          search_depth: "basic",
          max_results: 3,
          include_answer: false,
          include_raw_content: false,
        }),
      });
      const payload = (await response.json()) as TavilyResponse;

      if (!response.ok) {
        throw new Error(
          `Tavily search failed: ${payload.detail?.error ?? response.statusText}`,
        );
      }

      return (payload.results ?? [])
        .filter((result) => result.title && result.url)
        .slice(0, 3)
        .map((result) => ({
          title: result.title!,
          url: result.url!,
          content: result.content?.trim() ?? "",
        }));
    },
  };
}

export function extractSearchQuery(text: string): string {
  return text
    .replace(
      /^(请|麻烦)?\s*(帮我)?\s*(查一下|搜一下|搜索|帮我查|查查|找一下)\s*/i,
      "",
    )
    .replace(/\s*(的资料|资料)\s*$/i, "")
    .trim();
}

export function resolveSearchTopic(text: string): "general" | "news" {
  return /(最新|新闻|最近|今日|今天|刚刚)/.test(text) ? "news" : "general";
}
