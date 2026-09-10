import assert from "node:assert/strict";
import {
  buildJinaReaderUrl,
  createJinaWebReader,
  extractFirstUrl,
} from "../dist/verify/clients/webReader.js";

async function main() {
  verifyUrlExtraction();
  verifyJinaUrlConstruction();
  await verifyReadAndTruncate();
  await verifyDirectFallback();
  await verifyAccessRestriction();
  await verifyKnownPrivateUrl();
  await verifyEmptyContent();
  await verifyTimeout();

  console.log("Web reader local verification passed.");
}

function verifyUrlExtraction() {
  assert.equal(
    extractFirstUrl("帮我总结 https://example.com/article 这篇文章"),
    "https://example.com/article",
  );
  assert.equal(
    extractFirstUrl("https://one.example/a https://two.example/b"),
    "https://one.example/a",
  );
  assert.equal(extractFirstUrl("没有链接"), undefined);
}

function verifyJinaUrlConstruction() {
  assert.equal(
    buildJinaReaderUrl("https://example.com/article"),
    "https://r.jina.ai/https://example.com/article",
  );
  assert.equal(
    buildJinaReaderUrl("https://r.jina.ai/https://example.com/article"),
    "https://r.jina.ai/https://example.com/article",
  );
}

async function verifyReadAndTruncate() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response("1234567890", { status: 200 });
  };

  const reader = createJinaWebReader({ maxCharacters: 5 });
  const document = await reader.read("https://example.com/article");

  assert.equal(
    String(calls[0].input),
    "https://r.jina.ai/https://example.com/article",
  );
  assert.equal(document.url, "https://example.com/article");
  assert.equal(document.content, "12345");
  assert.equal(document.truncated, true);
}

async function verifyDirectFallback() {
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));

    if (String(input).startsWith("https://r.jina.ai/")) {
      return new Response("blocked", { status: 403 });
    }

    return new Response(
      "<html><style>hidden</style><body><h1>Hello</h1><p>World</p></body></html>",
      {
        status: 200,
      },
    );
  };

  const reader = createJinaWebReader();
  const document = await reader.read("https://example.com/article");

  assert.deepEqual(calls, [
    "https://r.jina.ai/https://example.com/article",
    "https://example.com/article",
  ]);
  assert.equal(document.content, "Hello World");
  assert.equal(document.truncated, false);
}

async function verifyAccessRestriction() {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("受区域限制，请先登录再使用。", {
      status: 200,
    });
  };

  const reader = createJinaWebReader();
  await assert.rejects(
    () => reader.read("https://example.com/private"),
    (error) => error.code === "access_restricted",
  );
  assert.equal(calls, 1);
}

async function verifyKnownPrivateUrl() {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unexpected", { status: 200 });
  };

  const reader = createJinaWebReader();
  await assert.rejects(
    () => reader.read("https://www.doubao.com/chat/123?channel=test"),
    (error) => error.code === "access_restricted",
  );
  assert.equal(calls, 0);
}

async function verifyEmptyContent() {
  globalThis.fetch = async () => new Response("   ", { status: 200 });
  const reader = createJinaWebReader();

  await assert.rejects(
    () => reader.read("https://example.com"),
    /empty content/,
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
  const reader = createJinaWebReader({ timeoutMs: 5 });

  await assert.rejects(() => reader.read("https://example.com"), /timed out/);
}

main();
