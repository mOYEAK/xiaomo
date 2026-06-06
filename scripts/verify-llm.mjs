import assert from "node:assert/strict";
import { createOpenAiCompatibleLlmClient, hasLlmConfig } from "../dist/verify/llmClient.js";

const env = {
  LLM_API_KEY: "test-key",
  LLM_BASE_URL: "https://api.moonshot.cn/v1/",
  LLM_MODEL: "kimi-k2.5",
};

async function main() {
  verifyConfigDetection();
  await verifyCompletion();
  await verifyHttpError();
  await verifyEmptyResponse();
  await verifyTimeout();

  console.log("LLM client local verification passed.");
}

function verifyConfigDetection() {
  assert.equal(hasLlmConfig(env), true);
  assert.equal(hasLlmConfig({ LLM_API_KEY: "test-key" }), false);
}

async function verifyCompletion() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "\u4f60\u597d\uff0c\u6211\u53ef\u4ee5\u5e2e\u4f60\u3002" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = createOpenAiCompatibleLlmClient(env);
  const reply = await client.complete([{ role: "user", content: "\u4f60\u597d" }]);

  assert.equal(reply, "\u4f60\u597d\uff0c\u6211\u53ef\u4ee5\u5e2e\u4f60\u3002");
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), "https://api.moonshot.cn/v1/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "kimi-k2.5");
  assert.equal(body.temperature, 1);
  assert.equal(body.messages[0].content, "\u4f60\u597d");
}

async function verifyHttpError() {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "invalid key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  const client = createOpenAiCompatibleLlmClient(env);
  await assert.rejects(
    () => client.complete([{ role: "user", content: "\u4f60\u597d" }]),
    /invalid key/,
  );
}

async function verifyEmptyResponse() {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: " " } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const client = createOpenAiCompatibleLlmClient(env);
  await assert.rejects(
    () => client.complete([{ role: "user", content: "\u4f60\u597d" }]),
    /empty response/,
  );
}

async function verifyTimeout() {
  globalThis.fetch = async (_input, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  const client = createOpenAiCompatibleLlmClient(env, { timeoutMs: 5 });
  await assert.rejects(
    () => client.complete([{ role: "user", content: "\u4f60\u597d" }]),
    /timed out/,
  );
}

main();
