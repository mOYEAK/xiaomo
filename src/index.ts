import {
  parseEncryptedXml,
  parseTextMessageXml,
  verifyAndDecryptMessage,
  type WecomTextMessage,
} from "./wecomCrypto";
import { sendWecomTextMessage } from "./wecomClient";

export interface Env {
  WX_CORP_ID: string;
  WX_APP_SECRET: string;
  WX_AGENT_ID: string;
  WX_TOKEN: string;
  WX_ENCODING_AES_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET") {
      return handleGetVerify(request, env);
    }

    if (request.method === "POST") {
      return handlePostMessage(request, env, ctx);
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;

async function handleGetVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const msgSignature = readRequiredSearchParam(url, "msg_signature");
    const timestamp = readRequiredSearchParam(url, "timestamp");
    const nonce = readRequiredSearchParam(url, "nonce");
    const echostr = readRequiredSearchParam(url, "echostr");
    const decrypted = await verifyAndDecryptMessage({
      token: env.WX_TOKEN,
      encodingAESKey: env.WX_ENCODING_AES_KEY,
      corpId: env.WX_CORP_ID,
      msgSignature,
      timestamp,
      nonce,
      encrypted: echostr,
    });

    return new Response(decrypted.message, { status: 200 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
}

async function handlePostMessage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const msgSignature = readRequiredSearchParam(url, "msg_signature");
    const timestamp = readRequiredSearchParam(url, "timestamp");
    const nonce = readRequiredSearchParam(url, "nonce");
    const encryptedXml = await request.text();
    const encrypted = parseEncryptedXml(encryptedXml);
    const decrypted = await verifyAndDecryptMessage({
      token: env.WX_TOKEN,
      encodingAESKey: env.WX_ENCODING_AES_KEY,
      corpId: env.WX_CORP_ID,
      msgSignature,
      timestamp,
      nonce,
      encrypted,
    });
    const message = parseTextMessageXml(decrypted.message);

    ctx.waitUntil(handleTask(env, message));

    return new Response("", { status: 200 });
  } catch {
    return new Response("", { status: 200 });
  }
}

async function handleTask(env: Env, message: WecomTextMessage): Promise<void> {
  await sendWecomTextMessage(env, message.fromUserName, `收到测试消息：${message.content}`);
}

function readRequiredSearchParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required search parameter: ${key}.`);
  }

  return value;
}
