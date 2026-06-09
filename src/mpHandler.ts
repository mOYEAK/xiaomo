import { runAgent, type AgentInput, type AgentOutput, type AgentRuntime } from "./agentCore";
import { createAgentRuntime, type AgentRuntimeEnv } from "./agentRuntime";
import {
  buildEmptyReply,
  decryptOfficialAccountMessage,
  parseEncryptedXml,
  parseOfficialAccountTextMessage,
  verifyMessageSignature,
  verifyPlainSignature,
  type OfficialAccountEnv,
  type OfficialAccountTextMessage,
} from "./wechatOfficial";
import { sendOfficialAccountCustomTextMessage } from "./wechatOfficialClient";

export interface MpEnv extends OfficialAccountEnv, AgentRuntimeEnv {}

export interface MpHandlerDependencies {
  createRuntime(env: AgentRuntimeEnv): AgentRuntime;
  runAgent(input: AgentInput, runtime: AgentRuntime): Promise<AgentOutput>;
  sendCustomTextMessage(env: OfficialAccountEnv, toUser: string, content: string): Promise<void>;
}

const defaultDependencies: MpHandlerDependencies = {
  createRuntime: createAgentRuntime,
  runAgent,
  sendCustomTextMessage: sendOfficialAccountCustomTextMessage,
};

export async function handleMpRequest(
  request: Request,
  env: MpEnv,
  ctx: ExecutionContext,
  dependencies: MpHandlerDependencies = defaultDependencies,
): Promise<Response> {
  if (request.method === "GET") {
    return handleGetVerify(request, env);
  }

  if (request.method === "POST") {
    return handlePostMessage(request, env, ctx, dependencies);
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
  env: MpEnv,
  ctx: ExecutionContext,
  dependencies: MpHandlerDependencies,
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

    console.info("Received WeChat Official Account text message.", {
      fromUser: message.fromUserName,
      contentLength: message.content.length,
    });
    ctx.waitUntil(runAgentAndSendReply(env, message, dependencies));

    return buildEmptyReply();
  } catch (error) {
    console.warn("Failed to process WeChat Official Account POST message.", {
      error: toSafeErrorMessage(error),
    });

    return buildEmptyReply();
  }
}

async function runAgentAndSendReply(
  env: MpEnv,
  message: OfficialAccountTextMessage,
  dependencies: MpHandlerDependencies,
): Promise<void> {
  let reply: string;
  let route: string;

  try {
    const result = await dependencies.runAgent(
      {
        userId: message.fromUserName,
        text: message.content,
        channel: "mp",
      },
      dependencies.createRuntime(env),
    );
    reply = result.reply;
    route = result.route;
    console.info("Completed WeChat Official Account Agent task.", {
      toUser: message.fromUserName,
      route,
      replyLength: reply.length,
    });
  } catch (error) {
    console.error("Failed to run WeChat Official Account Agent task.", {
      toUser: message.fromUserName,
      error: toSafeErrorMessage(error),
    });
    reply = "这次消息处理失败了，请稍后再试。";
    route = "error";
  }

  try {
    await dependencies.sendCustomTextMessage(env, message.fromUserName, reply);
    console.info("Sent WeChat Official Account Agent reply.", {
      toUser: message.fromUserName,
      route,
      contentLength: reply.length,
    });
  } catch (error) {
    console.error("Failed to send WeChat Official Account Agent reply.", {
      toUser: message.fromUserName,
      route,
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
