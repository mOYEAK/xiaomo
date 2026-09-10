import assert from "node:assert/strict";
import { runAgent } from "../dist/verify/core/agent/agent.js";
import {
  createTavilySearchClient,
  extractSearchQuery,
  resolveSearchTopic,
} from "../dist/verify/clients/searchClient.js";

async function main() {
  verifyParsing();
  await verifyTavilyClient();
  await verifySearchAnswer();
  await verifySearchWithoutLlm();
  await verifyEmptyAndFailure();
  console.log("Search local verification passed.");
}

function verifyParsing() {
  assert.equal(extractSearchQuery("帮我查一下量子计算的资料"), "量子计算");
  assert.equal(resolveSearchTopic("最近人工智能新闻"), "news");
  assert.equal(resolveSearchTopic("搜索 TypeScript 教程"), "general");
}

async function verifyTavilyClient() {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return Response.json({
      results: [
        { title: "结果一", url: "https://example.com/1", content: "摘要一" },
        { title: "结果二", url: "https://example.com/2", content: "摘要二" },
        { title: "结果三", url: "https://example.com/3", content: "摘要三" },
        { title: "结果四", url: "https://example.com/4", content: "摘要四" },
      ],
    });
  };

  const client = createTavilySearchClient({ TAVILY_API_KEY: "tvly-test" });
  const results = await client.search("人工智能新闻", "news");
  const body = JSON.parse(calls[0].init.body);

  assert.equal(results.length, 3);
  assert.equal(calls[0].init.headers.Authorization, "Bearer tvly-test");
  assert.equal(body.search_depth, "basic");
  assert.equal(body.max_results, 3);
  assert.equal(body.topic, "news");
}

async function verifySearchAnswer() {
  const llmCalls = [];
  const output = await runAgent(
    { userId: "web-user", text: "帮我查一下最新人工智能新闻", channel: "web" },
    {
      searchClient: createMemorySearchClient(),
      llmClient: {
        async complete(messages) {
          llmCalls.push(messages);
          return "根据搜索结果，近期有新模型发布。[1]";
        },
      },
    },
  );

  assert.equal(output.route, "search");
  assert.match(output.reply, /来源/);
  assert.match(output.reply, /https:\/\/example\.com\/1/);
  assert.equal(llmCalls.length, 1);
  assert.match(llmCalls[0][0].content, /不要编造/);
}

async function verifySearchWithoutLlm() {
  const output = await runAgent(
    { userId: "web-user", text: "搜索人工智能", channel: "web" },
    { searchClient: createMemorySearchClient() },
  );
  assert.match(output.reply, /搜索结果/);
  assert.match(output.reply, /结果一/);
}

async function verifyEmptyAndFailure() {
  const empty = await runAgent(
    { userId: "web-user", text: "搜索不存在内容", channel: "web" },
    {
      searchClient: {
        async search() {
          return [];
        },
      },
    },
  );
  assert.match(empty.reply, /没有找到/);

  const failure = await runAgent(
    { userId: "web-user", text: "搜索人工智能", channel: "web" },
    {
      searchClient: {
        async search() {
          throw new Error("offline");
        },
      },
    },
  );
  assert.match(failure.reply, /暂时无法完成联网搜索/);
}

function createMemorySearchClient() {
  return {
    async search(query, topic) {
      assert.ok(query);
      assert.ok(topic);
      return [
        { title: "结果一", url: "https://example.com/1", content: "摘要一" },
        { title: "结果二", url: "https://example.com/2", content: "摘要二" },
      ];
    },
  };
}

main();
