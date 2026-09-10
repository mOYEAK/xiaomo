import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleMpRequest } from "../dist/verify/channels/mp/mpHandler.js";
import {
  buildTextReplyXml,
  parseOfficialAccountTextMessage,
} from "../dist/verify/channels/mp/officialAccount.js";
import { truncateOfficialAccountText } from "../dist/verify/clients/officialAccountClient.js";

const token = "mp-token";
const sampleText = "你好";

async function main() {
  await verifyPublicUrlSignature();
  verifyTextMessageParsing();
  verifyTextReplyXml();
  verifyLongCustomTextIsTruncated();
  await verifyTextMessageRunsAgentAsynchronously();
  await verifyUnsupportedMessageIsIgnored();
  await verifyInvalidSignatureIsIgnored();
  await verifyAgentFailureGetsFallbackReply();
  await verifyCustomMessageFailureDoesNotRejectTask();

  console.log("WeChat Official Account local verification passed.");
}

async function verifyPublicUrlSignature() {
  const timestamp = "1710000000";
  const nonce = "mp-nonce";
  const echostr = "public-mp-route";
  const signature = createSha1Signature(token, timestamp, nonce);
  const response = await handleMpRequest(
    new Request(
      `https://example.com/mp?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`,
    ),
    createEnv(),
    createContext().ctx,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), echostr);
}

function verifyTextMessageParsing() {
  const message = parseOfficialAccountTextMessage(
    buildMessageXml("text", sampleText),
  );

  assert.equal(message.toUserName, "gh_app");
  assert.equal(message.fromUserName, "o_user");
  assert.equal(message.msgType, "text");
  assert.equal(message.content, sampleText);
}

function verifyTextReplyXml() {
  const reply = buildTextReplyXml(
    {
      toUserName: "gh_app",
      fromUserName: "o_user",
      msgType: "text",
      content: sampleText,
    },
    `收到测试消息：${sampleText}`,
  );

  assert.match(reply, /<ToUserName><!\[CDATA\[o_user\]\]><\/ToUserName>/);
  assert.match(reply, /收到测试消息：你好/);
}

function verifyLongCustomTextIsTruncated() {
  const content = "搜索结果".repeat(1000);
  const truncated = truncateOfficialAccountText(content);

  assert.ok(new TextEncoder().encode(truncated).length <= 2048);
  assert.match(truncated, /\[内容过长，已截断\]$/);
}

async function verifyTextMessageRunsAgentAsynchronously() {
  let resolveAgent;
  const agentPromise = new Promise((resolve) => {
    resolveAgent = resolve;
  });
  const agentCalls = [];
  const sent = [];
  const context = createContext();
  const response = await handleMpRequest(
    createPostRequest("text", "明天上海天气怎么样"),
    createEnv(),
    context.ctx,
    createDependencies({
      async runAgent(input) {
        agentCalls.push(input);
        return agentPromise;
      },
      async sendCustomTextMessage(_env, toUser, content) {
        sent.push({ toUser, content });
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "success");
  assert.equal(context.promises.length, 1);
  assert.deepEqual(agentCalls, [
    { userId: "o_user", text: "明天上海天气怎么样", channel: "mp" },
  ]);
  assert.equal(sent.length, 0);

  resolveAgent({ route: "weather", reply: "上海明天晴。" });
  await Promise.all(context.promises);
  assert.deepEqual(sent, [{ toUser: "o_user", content: "上海明天晴。" }]);
}

async function verifyUnsupportedMessageIsIgnored() {
  let agentCalls = 0;
  const context = createContext();
  const response = await handleMpRequest(
    createPostRequest("image", ""),
    createEnv(),
    context.ctx,
    createDependencies({
      async runAgent() {
        agentCalls += 1;
        return { route: "chat", reply: "unexpected" };
      },
    }),
  );

  assert.equal(await response.text(), "success");
  assert.equal(context.promises.length, 0);
  assert.equal(agentCalls, 0);
}

async function verifyInvalidSignatureIsIgnored() {
  const context = createContext();
  const response = await handleMpRequest(
    new Request(
      "https://example.com/mp?signature=bad&timestamp=1710000000&nonce=nonce",
      {
        method: "POST",
        body: buildMessageXml("text", sampleText),
      },
    ),
    createEnv(),
    context.ctx,
  );

  assert.equal(await response.text(), "success");
  assert.equal(context.promises.length, 0);
}

async function verifyAgentFailureGetsFallbackReply() {
  const sent = [];
  const context = createContext();
  await handleMpRequest(
    createPostRequest("text", sampleText),
    createEnv(),
    context.ctx,
    createDependencies({
      async runAgent() {
        throw new Error("agent unavailable");
      },
      async sendCustomTextMessage(_env, toUser, content) {
        sent.push({ toUser, content });
      },
    }),
  );

  await Promise.all(context.promises);
  assert.deepEqual(sent, [
    { toUser: "o_user", content: "这次消息处理失败了，请稍后再试。" },
  ]);
}

async function verifyCustomMessageFailureDoesNotRejectTask() {
  const context = createContext();
  await handleMpRequest(
    createPostRequest("text", sampleText),
    createEnv(),
    context.ctx,
    createDependencies({
      async sendCustomTextMessage() {
        throw new Error("custom message unavailable");
      },
    }),
  );

  await Promise.all(context.promises);
}

function createPostRequest(msgType, content) {
  const timestamp = "1710000000";
  const nonce = "mp-nonce";
  const signature = createSha1Signature(token, timestamp, nonce);

  return new Request(
    `https://example.com/mp?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
    {
      method: "POST",
      body: buildMessageXml(msgType, content),
    },
  );
}

function buildMessageXml(msgType, content) {
  return `
    <xml>
      <ToUserName><![CDATA[gh_app]]></ToUserName>
      <FromUserName><![CDATA[o_user]]></FromUserName>
      <CreateTime>1710000000</CreateTime>
      <MsgType><![CDATA[${msgType}]]></MsgType>
      <Content><![CDATA[${content}]]></Content>
      <MsgId>1234567890</MsgId>
    </xml>
  `;
}

function createDependencies(overrides = {}) {
  return {
    createRuntime() {
      return {};
    },
    async runAgent() {
      return { route: "chat", reply: "Agent reply" };
    },
    async sendCustomTextMessage() {},
    ...overrides,
  };
}

function createEnv() {
  return {
    MP_TOKEN: token,
    MP_APP_ID: "app-id",
    MP_APP_SECRET: "app-secret",
  };
}

function createContext() {
  const promises = [];
  return {
    promises,
    ctx: {
      waitUntil(promise) {
        promises.push(promise);
      },
      passThroughOnException() {},
      props: {},
    },
  };
}

function createSha1Signature(...parts) {
  return createHash("sha1")
    .update([...parts].sort().join(""))
    .digest("hex");
}

await main();
