import type { OfficialAccountEnv } from "./wechatOfficial";

interface AccessTokenResponse {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface CustomMessageResponse {
  errcode?: number;
  errmsg?: string;
}

export async function sendOfficialAccountCustomTextMessage(
  env: OfficialAccountEnv,
  toUser: string,
  content: string,
): Promise<void> {
  if (!env.MP_APP_ID || !env.MP_APP_SECRET) {
    throw new Error("MP_APP_ID and MP_APP_SECRET are required for custom messages.");
  }

  const accessToken = await getOfficialAccountAccessToken(env.MP_APP_ID, env.MP_APP_SECRET);
  const url = new URL("https://api.weixin.qq.com/cgi-bin/message/custom/send");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      touser: toUser,
      msgtype: "text",
      text: {
        content,
      },
    }),
  });
  const payload = (await response.json()) as CustomMessageResponse;

  if (!response.ok || payload.errcode !== 0) {
    throw new Error(`Failed to send WeChat Official Account custom message: ${payload.errmsg ?? response.statusText}`);
  }
}

async function getOfficialAccountAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetch(url);
  const payload = (await response.json()) as AccessTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(`Failed to get WeChat Official Account access_token: ${payload.errmsg ?? response.statusText}`);
  }

  return payload.access_token;
}
