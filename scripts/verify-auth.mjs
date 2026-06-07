import assert from "node:assert/strict";
import {
  handleLoginRequest,
  handleLogoutRequest,
  isAuthenticated,
  unauthorizedResponse,
} from "../dist/verify/auth.js";

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

main();
