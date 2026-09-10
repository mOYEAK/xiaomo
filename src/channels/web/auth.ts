import { hasAuthConfig } from "../../config/env";
import { htmlResponse, jsonResponse } from "../../lib/http";
import { buildLoginHtml } from "../../views/loginPage";

export interface AuthEnv {
  H5_ACCESS_PASSWORD?: string;
  H5_SESSION_SECRET?: string;
}

export { hasAuthConfig };

const cookieName = "personal_agent_session";
const sessionSeconds = 7 * 24 * 60 * 60;

export async function isAuthenticated(
  request: Request,
  env: AuthEnv,
): Promise<boolean> {
  if (!env.H5_SESSION_SECRET) return false;

  const token = readCookie(request.headers.get("Cookie"), cookieName);
  if (!token) return false;

  const [expiryText, signature] = token.split(".");
  const expiry = Number(expiryText);

  if (
    !expiryText ||
    !signature ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  const expected = await sign(expiryText, env.H5_SESSION_SECRET);
  return timingSafeEqual(signature, expected);
}

export async function handleLoginRequest(
  request: Request,
  env: AuthEnv,
): Promise<Response> {
  if (request.method === "GET") {
    if (await isAuthenticated(request, env)) {
      return Response.redirect(new URL("/chat", request.url).toString(), 302);
    }

    return htmlResponse(buildLoginHtml());
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  if (!hasAuthConfig(env)) {
    return jsonResponse({ error: "访问口令尚未配置。" }, 503);
  }

  let password: string;

  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return jsonResponse({ error: "请求格式不正确。" }, 400);
  }

  if (!timingSafeEqual(password, env.H5_ACCESS_PASSWORD!)) {
    return jsonResponse({ error: "访问口令不正确。" }, 401);
  }

  const expiry = Math.floor(Date.now() / 1000) + sessionSeconds;
  const token = `${expiry}.${await sign(String(expiry), env.H5_SESSION_SECRET!)}`;
  const response = jsonResponse({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${cookieName}=${token}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

export function handleLogoutRequest(request: Request): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL("/login", request.url).toString(),
      "Set-Cookie": `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

export function unauthorizedResponse(request: Request): Response {
  const url = new URL(request.url);

  if (url.pathname === "/chat") {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }

  return jsonResponse({ error: "未登录或登录已过期。" }, 401);
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(signature));
}

function readCookie(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
