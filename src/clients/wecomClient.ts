interface WecomClientEnv {
  WX_CORP_ID: string;
  WX_APP_SECRET: string;
  WX_AGENT_ID: string;
}

interface AccessTokenResponse {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface SendMessageResponse {
  errcode?: number;
  errmsg?: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
}

export async function getWecomAccessToken(
  env: WecomClientEnv,
): Promise<string> {
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", env.WX_CORP_ID);
  url.searchParams.set("corpsecret", env.WX_APP_SECRET);

  const response = await fetch(url);
  const payload = (await response.json()) as AccessTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Failed to get WeCom access_token: ${payload.errmsg ?? response.statusText}`,
    );
  }

  return payload.access_token;
}

export async function sendWecomTextMessage(
  env: WecomClientEnv,
  toUser: string,
  content: string,
): Promise<void> {
  const accessToken = await getWecomAccessToken(env);
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/message/send");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      touser: toUser,
      msgtype: "text",
      agentid: Number(env.WX_AGENT_ID),
      text: {
        content,
      },
      safe: 0,
    }),
  });
  const payload = (await response.json()) as SendMessageResponse;

  if (!response.ok || payload.errcode !== 0) {
    throw new Error(
      `Failed to send WeCom message: ${payload.errmsg ?? response.statusText}`,
    );
  }
}
