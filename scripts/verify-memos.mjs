import assert from "node:assert/strict";
import { runAgent } from "../dist/verify/agentCore.js";
import { createSupabaseMemoStore } from "../dist/verify/memoStore.js";

async function main() {
  await verifyMemoAgent();
  await verifyMemoStore();
  console.log("Memo local verification passed.");
}

async function verifyMemoAgent() {
  const store = createMemoryMemoStore();
  const created = await runAgent(
    { userId: "web-user", text: "记一下：护照放在书桌抽屉", channel: "web" },
    { memoStore: store },
  );
  assert.equal(created.route, "memo_create");
  assert.match(created.reply, /护照放在书桌抽屉/);

  const searched = await runAgent(
    { userId: "web-user", text: "我之前把护照放哪了", channel: "web" },
    { memoStore: store },
  );
  assert.equal(searched.route, "memo_search");
  assert.match(searched.reply, /书桌抽屉/);

  const listed = await runAgent(
    { userId: "web-user", text: "查看备忘录", channel: "web" },
    { memoStore: store },
  );
  assert.equal(listed.route, "memo_list");

  const deleting = await runAgent(
    { userId: "web-user", text: "删除备忘录", channel: "web" },
    { memoStore: store },
  );
  assert.equal(deleting.route, "memo_delete");
  assert.match(deleting.reply, /右侧备忘录列表/);
}

async function verifyMemoStore() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    if (init.method === "POST") {
      return Response.json([
        {
          id: "memo-1",
          user_id: "web-user",
          content: "护照放在书桌抽屉",
          source_message: "记一下：护照放在书桌抽屉",
        },
      ], { status: 201 });
    }
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json([]);
  };

  const store = createSupabaseMemoStore({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
  });
  await store.createMemo("web-user", "护照放在书桌抽屉", "记一下：护照放在书桌抽屉");
  await store.searchMemos("web-user", "护照");
  await store.deleteMemo("web-user", "memo-1");

  assert.equal(JSON.parse(calls[0].init.body).content, "护照放在书桌抽屉");
  assert.equal(new URL(String(calls[1].input)).searchParams.get("content"), "ilike.*护照*");
  assert.equal(new URL(String(calls[2].input)).searchParams.get("user_id"), "eq.web-user");
}

function createMemoryMemoStore() {
  const memos = [];
  return {
    async createMemo(userId, content, sourceMessage) {
      const memo = { id: "memo-1", user_id: userId, content, source_message: sourceMessage };
      memos.push(memo);
      return memo;
    },
    async listMemos() {
      return memos;
    },
    async searchMemos(userId, query) {
      return memos.filter((memo) => memo.user_id === userId && memo.content.includes(query));
    },
    async deleteMemo(userId, id) {
      const index = memos.findIndex((memo) => memo.user_id === userId && memo.id === id);
      if (index >= 0) memos.splice(index, 1);
    },
  };
}

main();
