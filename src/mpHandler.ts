import {
  buildEmptyReply,
  buildTextReplyXml,
  decryptOfficialAccountMessage,
  parseEncryptedXml,
  parseOfficialAccountTextMessage,
  verifyMessageSignature,
  verifyPlainSignature,
  type OfficialAccountEnv,
  type OfficialAccountTextMessage,
} from "./wechatOfficial";
import { sendOfficialAccountCustomTextMessage } from "./wechatOfficialClient";

const TEST_REPLY_PREFIX = "\u6536\u5230\u6d4b\u8bd5\u6d88\u606f\uff1a";
const CUSTOM_REPLY_PREFIX = "\u4e3b\u52a8\u5ba2\u670d\u6d88\u606f\u6d4b\u8bd5\uff1a";

export async function handleMpRequest(
  request: Request,
  env: OfficialAccountEnv,
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

async function handleGetVerify(request: Request, env: OfficialAccountEnv): Promise<Response> {
  try {
    const url = new URL(request.url);
    const signature = readRequiredSearchParam(url, "signature");
    const timestamp = readRequiredSearchParam(url, "timestamp");
    const nonce = readRequiredSearchParam(url, "nonce");
    const echostr = readRequiredSearchParam(url, "echostr");
    const verified = await verifyPlainSignature(env.MP_TOKEN, timestamp, nonce, signature);

    if (!verified) {
      return new Response("Forbidden", { status: 403 });
    }

    return new Response(echostr, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.warn("Failed to verify WeChat Official Account URL.", {
      error: toSafeErrorMessage(error),
    });

    return new Response("Forbidden", { status: 403 });
  }
}

async function handlePostMessage(
  request: Request,
  env: OfficialAccountEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const timestamp = readRequiredSearchParam(url, "timestamp");
    const nonce = readRequiredSearchParam(url, "nonce");
    const xmlText = await request.text();
    const plaintextXml = await resolveMessageXml(url, xmlText, env, timestamp, nonce);
    const message = parseOfficialAccountTextMessage(plaintextXml);

    if (message.msgType !== "text") {
      console.info("Ignored unsupported WeChat Official Account message type.", {
        fromUser: message.fromUserName,
        msgType: message.msgType,
      });

      return buildEmptyReply();
    }

    const replyXml = buildTextReplyXml(message, `${TEST_REPLY_PREFIX}${message.content}`);
    console.info("Received WeChat Official Account text message.", {
      fromUser: message.fromUserName,
      contentLength: message.content.length,
    });
    ctx.waitUntil(sendCustomReply(env, message));

    return new Response(replyXml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.warn("Failed to process WeChat Official Account POST message.", {
      error: toSafeErrorMessage(error),
    });

    return buildEmptyReply();
  }
}

async function sendCustomReply(
  env: OfficialAccountEnv,
  message: OfficialAccountTextMessage,
): Promise<void> {
  try {
    await sendOfficialAccountCustomTextMessage(
      env,
      message.fromUserName,
      `${CUSTOM_REPLY_PREFIX}${message.content}`,
    );
    console.info("Sent WeChat Official Account custom reply.", {
      toUser: message.fromUserName,
      contentLength: message.content.length,
    });
  } catch (error) {
    console.warn("Failed to send WeChat Official Account custom reply.", {
      toUser: message.fromUserName,
      error: toSafeErrorMessage(error),
    });
  }
}

async function resolveMessageXml(
  url: URL,
  xmlText: string,
  env: OfficialAccountEnv,
  timestamp: string,
  nonce: string,
): Promise<string> {
  if (url.searchParams.get("encrypt_type") !== "aes") {
    const signature = readRequiredSearchParam(url, "signature");
    const verified = await verifyPlainSignature(env.MP_TOKEN, timestamp, nonce, signature);

    if (!verified) {
      throw new Error("Invalid WeChat Official Account plaintext signature.");
    }

    return xmlText;
  }

  if (!env.MP_APP_ID || !env.MP_ENCODING_AES_KEY) {
    throw new Error("Encrypted WeChat Official Account messages require MP_APP_ID and MP_ENCODING_AES_KEY.");
  }

  const msgSignature = readRequiredSearchParam(url, "msg_signature");
  const encrypted = parseEncryptedXml(xmlText);
  const verified = await verifyMessageSignature(
    env.MP_TOKEN,
    timestamp,
    nonce,
    encrypted,
    msgSignature,
  );

  if (!verified) {
    throw new Error("Invalid WeChat Official Account encrypted message signature.");
  }

  return decryptOfficialAccountMessage(encrypted, env.MP_ENCODING_AES_KEY, env.MP_APP_ID);
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
