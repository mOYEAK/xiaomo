import {
  parseEncryptedXml,
  parseTextMessageXml,
  verifyAndDecryptMessage,
  type WecomTextMessage,
} from "./wecomCrypto";
import { sendWecomTextMessage } from "./wecomClient";

const TEST_REPLY_PREFIX = "\u6536\u5230\u6d4b\u8bd5\u6d88\u606f\uff1a";

export interface WecomEnv {
  WX_CORP_ID: string;
  WX_APP_SECRET: string;
  WX_AGENT_ID: string;
  WX_TOKEN: string;
  WX_ENCODING_AES_KEY: string;
}

export async function handleWecomRequest(
  request: Request,
  env: WecomEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method === "GET") {
    return handleGetVerify(request, env);
  }

  if (request.method === "POST") {
    return handlePostMessage(request, env, ctx);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleGetVerify(request: Request, env: WecomEnv): Promise<Response> {
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

    return new Response(decrypted.message, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.warn("Failed to verify WeCom URL.", {
      error: toSafeErrorMessage(error),
    });

    return new Response("Forbidden", { status: 403 });
  }
}

async function handlePostMessage(
  request: Request,
  env: WecomEnv,
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

    if (message.msgType !== "text") {
      console.info("Ignored unsupported WeCom message type.", {
        fromUser: message.fromUserName,
        msgType: message.msgType,
      });

      return new Response("", { status: 200 });
    }

    console.info("Received WeCom text message.", {
      fromUser: message.fromUserName,
      contentLength: message.content.length,
    });
    ctx.waitUntil(sendTestReply(env, message));

    return new Response("", { status: 200 });
  } catch (error) {
    console.warn("Failed to process WeCom POST message.", {
      error: toSafeErrorMessage(error),
    });

    return new Response("", { status: 200 });
  }
}

async function sendTestReply(env: WecomEnv, message: WecomTextMessage): Promise<void> {
  try {
    await sendWecomTextMessage(env, message.fromUserName, `${TEST_REPLY_PREFIX}${message.content}`);
    console.info("Sent WeCom test reply.", {
      toUser: message.fromUserName,
      contentLength: message.content.length,
    });
  } catch (error) {
    console.error("Failed to send WeCom test reply.", {
      toUser: message.fromUserName,
      error: toSafeErrorMessage(error),
    });
  }
}

function readRequiredSearchParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required search parameter: ${key}.`);
  }

  return value;
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
