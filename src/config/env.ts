/**
 * 统一的环境变量类型与配置检测。
 * 微信回调必需的字段声明为必填，其余能力按需启用。
 */
export interface AppEnv {
  // Supabase
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // LLM
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  // 搜索
  TAVILY_API_KEY?: string;
  // H5 访问口令
  H5_ACCESS_PASSWORD?: string;
  H5_SESSION_SECRET?: string;
  // 微信公众号
  MP_TOKEN: string;
  MP_APP_ID?: string;
  MP_APP_SECRET?: string;
  MP_ENCODING_AES_KEY?: string;
  // 企业微信
  WX_CORP_ID: string;
  WX_APP_SECRET: string;
  WX_AGENT_ID: string;
  WX_TOKEN: string;
  WX_ENCODING_AES_KEY: string;
}

export function hasSupabaseConfig(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasLlmConfig(env: {
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}): boolean {
  return Boolean(env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL);
}

export function hasSearchConfig(env: { TAVILY_API_KEY?: string }): boolean {
  return Boolean(env.TAVILY_API_KEY);
}

export function hasAuthConfig(env: {
  H5_ACCESS_PASSWORD?: string;
  H5_SESSION_SECRET?: string;
}): boolean {
  return Boolean(env.H5_ACCESS_PASSWORD && env.H5_SESSION_SECRET);
}
