export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * Supabase PostgREST 公共客户端：统一鉴权头、Prefer 头与错误解析，
 * 各 store 只关心表名、查询参数与记录映射。
 */
export interface SupabaseRestClient {
  createUrl(table: string): URL;
  fetchJson<T>(url: URL, init?: SupabaseRequestInit): Promise<T>;
  fetchVoid(url: URL, init?: SupabaseRequestInit): Promise<void>;
}

export interface SupabaseRequestInit extends Omit<RequestInit, "headers"> {
  prefer?: string;
}

export function createSupabaseRestClient(env: SupabaseEnv): SupabaseRestClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  function buildHeaders(prefer?: string): HeadersInit {
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

  return {
    createUrl(table) {
      return new URL(`${baseUrl}/rest/v1/${table}`);
    },

    async fetchJson<T>(url: URL, init: SupabaseRequestInit = {}): Promise<T> {
      const { prefer, ...rest } = init;
      const response = await fetch(url, {
        ...rest,
        headers: buildHeaders(prefer),
      });
      return readJsonResponse<T>(response);
    },

    async fetchVoid(url: URL, init: SupabaseRequestInit = {}): Promise<void> {
      const { prefer, ...rest } = init;
      const response = await fetch(url, {
        ...rest,
        headers: buildHeaders(prefer),
      });

      if (!response.ok) {
        await throwSupabaseError(response);
      }
    },
  };
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
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
      details?: string;
    };
    detail = payload.message ?? payload.error ?? payload.details ?? detail;
  } catch {
    try {
      detail = await response.text();
    } catch {
      // 保留 statusText。
    }
  }

  throw new Error(`Supabase request failed: ${detail}`);
}
