import {
  buildEmptyReply,
  buildTextReplyXml,
  decryptOfficialAccountMessage,
  parseEncryptedXml,
  parseOfficialAccountTextMessage,
  verifyMessageSignature,
  verifyPlainSignature,
  type OfficialAccountEnv,
} from "./wechatOfficial";

const TEST_REPLY_PREFIX = "\u6536\u5230\u6d4b\u8bd5\u6d88\u606f\uff1a";

export interface Env extends OfficialAccountEnv {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") {
      return handleGetVerify(request, env);
    }

    if (request.method === "POST") {
      return handlePostMessage(request, env);
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;

async function handleGetVerify(request: Request, env: Env): Promise<Response> {
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

async function handlePostMessage(request: Request, env: Env): Promise<Response> {
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

    return new Response(replyXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.warn("Failed to process WeChat Official Account POST message.", {
      error: toSafeErrorMessage(error),
    });

    return buildEmptyReply();
  }
}

async function resolveMessageXml(
  url: URL,
  xmlText: string,
  env: Env,
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
