import type { SupabaseEnv } from "./reminderStore";

export interface MemoRecord {
  id: string;
  user_id: string;
  content: string;
  source_message: string;
  created_at?: string;
  updated_at?: string;
}

export interface MemoStore {
  createMemo(userId: string, content: string, sourceMessage: string): Promise<MemoRecord>;
  listMemos(userId: string): Promise<MemoRecord[]>;
  searchMemos(userId: string, query: string): Promise<MemoRecord[]>;
  deleteMemo(userId: string, id: string): Promise<void>;
}

export function createSupabaseMemoStore(env: SupabaseEnv): MemoStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    async createMemo(userId, content, sourceMessage) {
      const response = await fetch(`${baseUrl}/rest/v1/memos`, {
        method: "POST",
        headers: buildHeaders(serviceRoleKey, "return=representation"),
        body: JSON.stringify({
          user_id: userId,
          content,
          source_message: sourceMessage,
        }),
      });
      const records = await readJsonResponse<MemoRecord[]>(response);

      if (!records[0]) {
        throw new Error("Supabase did not return the created memo.");
      }

      return records[0];
    },

    async listMemos(userId) {
      const url = createMemoListUrl(baseUrl);
      url.searchParams.set("user_id", `eq.${userId}`);
      return readJsonResponse<MemoRecord[]>(await fetch(url, { headers: buildHeaders(serviceRoleKey) }));
    },

    async searchMemos(userId, query) {
      const url = createMemoListUrl(baseUrl);
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("content", `ilike.*${query}*`);
      return readJsonResponse<MemoRecord[]>(await fetch(url, { headers: buildHeaders(serviceRoleKey) }));
    },

    async deleteMemo(userId, id) {
      const url = new URL(`${baseUrl}/rest/v1/memos`);
      url.searchParams.set("id", `eq.${id}`);
      url.searchParams.set("user_id", `eq.${userId}`);

      const response = await fetch(url, {
        method: "DELETE",
        headers: buildHeaders(serviceRoleKey, "return=minimal"),
      });

      if (!response.ok) {
        await throwSupabaseError(response);
      }
    },
  };
}

function createMemoListUrl(baseUrl: string): URL {
  const url = new URL(`${baseUrl}/rest/v1/memos`);
  url.searchParams.set("select", "id,user_id,content,source_message,created_at,updated_at");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "50");
  return url;
}

function buildHeaders(serviceRoleKey: string, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };

  if (serviceRoleKey.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }

  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) await throwSupabaseError(response);
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
