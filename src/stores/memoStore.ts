import {
  createSupabaseRestClient,
  type SupabaseEnv,
  type SupabaseRestClient,
} from "../clients/supabase";

export interface MemoRecord {
  id: string;
  user_id: string;
  content: string;
  source_message: string;
  created_at?: string;
  updated_at?: string;
}

export interface MemoStore {
  createMemo(
    userId: string,
    content: string,
    sourceMessage: string,
  ): Promise<MemoRecord>;
  listMemos(userId: string): Promise<MemoRecord[]>;
  searchMemos(userId: string, query: string): Promise<MemoRecord[]>;
  deleteMemo(userId: string, id: string): Promise<void>;
}

export function createSupabaseMemoStore(env: SupabaseEnv): MemoStore {
  return createMemoStore(createSupabaseRestClient(env));
}

export function createMemoStore(rest: SupabaseRestClient): MemoStore {
  return {
    async createMemo(userId, content, sourceMessage) {
      const records = await rest.fetchJson<MemoRecord[]>(
        rest.createUrl("memos"),
        {
          method: "POST",
          prefer: "return=representation",
          body: JSON.stringify({
            user_id: userId,
            content,
            source_message: sourceMessage,
          }),
        },
      );
      const record = records[0];

      if (!record) {
        throw new Error("Supabase did not return the created memo.");
      }

      return record;
    },

    async listMemos(userId) {
      const url = createMemoListUrl();
      url.searchParams.set("user_id", `eq.${userId}`);
      return rest.fetchJson<MemoRecord[]>(url);
    },

    async searchMemos(userId, query) {
      const url = createMemoListUrl();
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("content", `ilike.*${query}*`);
      return rest.fetchJson<MemoRecord[]>(url);
    },

    async deleteMemo(userId, id) {
      const url = rest.createUrl("memos");
      url.searchParams.set("id", `eq.${id}`);
      url.searchParams.set("user_id", `eq.${userId}`);

      await rest.fetchVoid(url, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    },
  };

  function createMemoListUrl(): URL {
    const url = rest.createUrl("memos");
    url.searchParams.set(
      "select",
      "id,user_id,content,source_message,created_at,updated_at",
    );
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "50");
    return url;
  }
}
