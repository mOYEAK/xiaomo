import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  handleLoginRequest,
  handleLogoutRequest,
  isAuthenticated,
  unauthorizedResponse,
} from "../dist/verify/auth.js";
import worker from "../dist/verify/index.js";

const env = {
  H5_ACCESS_PASSWORD: "correct-password",
  H5_SESSION_SECRET: "a-long-random-session-secret",
};

async function main() {
  await verifyLogin();
  await verifyBadLogin();
  await verifyTamperedCookie();
  verifyUnauthorizedResponses();
  verifyLogout();
  await verifyMpRemainsPublic();
  console.log("H5 auth local verification passed.");
}

async function verifyLogin() {
  const response = await handleLoginRequest(
    new Request("https://example.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct-password" }),
    }),
    env,
  );
  const cookie = response.headers.get("Set-Cookie");

  assert.equal(response.status, 200);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);

  const request = new Request("https://example.com/api/chat", {
    headers: { Cookie: cookie.split(";")[0] },
  });
  assert.equal(await isAuthenticated(request, env), true);
}

async function verifyBadLogin() {
  const response = await handleLoginRequest(
    new Request("https://example.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    }),
    env,
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Set-Cookie"), null);
}

async function verifyTamperedCookie() {
  const request = new Request("https://example.com/api/chat", {
    headers: { Cookie: "personal_agent_session=9999999999.invalid" },
  });
  assert.equal(await isAuthenticated(request, env), false);
}

function verifyUnauthorizedResponses() {
  const chat = unauthorizedResponse(new Request("https://example.com/chat"));
  const api = unauthorizedResponse(new Request("https://example.com/api/chat"));

  assert.equal(chat.status, 302);
  assert.equal(chat.headers.get("Location"), "https://example.com/login");
  assert.equal(api.status, 401);
}

function verifyLogout() {
  const response = handleLogoutRequest(new Request("https://example.com/logout"));
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
}

async function verifyMpRemainsPublic() {
  const timestamp = "1710000000";
  const nonce = "mp-nonce";
  const echostr = "public-mp-route";
  const token = "mp-token";
  const signature = createHash("sha1")
    .update([token, timestamp, nonce].sort().join(""))
    .digest("hex");
  const response = await worker.fetch(
    new Request(
      `https://example.com/mp?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}`,
    ),
    {
      ...env,
      MP_TOKEN: token,
    },
    createExecutionContext(),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), echostr);
}

function createExecutionContext() {
  return {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  };
}

main();
