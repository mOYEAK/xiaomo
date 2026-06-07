export interface AuthEnv {
  H5_ACCESS_PASSWORD?: string;
  H5_SESSION_SECRET?: string;
}

const cookieName = "personal_agent_session";
const sessionSeconds = 7 * 24 * 60 * 60;

export function hasAuthConfig(env: AuthEnv): boolean {
  return Boolean(env.H5_ACCESS_PASSWORD && env.H5_SESSION_SECRET);
}

export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.H5_SESSION_SECRET) return false;

  const token = readCookie(request.headers.get("Cookie"), cookieName);
  if (!token) return false;

  const [expiryText, signature] = token.split(".");
  const expiry = Number(expiryText);

  if (!expiryText || !signature || !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await sign(expiryText, env.H5_SESSION_SECRET);
  return timingSafeEqual(signature, expected);
}

export async function handleLoginRequest(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method === "GET") {
    if (await isAuthenticated(request, env)) {
      return Response.redirect(new URL("/chat", request.url).toString(), 302);
    }

    return htmlResponse(buildLoginHtml());
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!hasAuthConfig(env)) {
    return jsonResponse({ error: "访问口令尚未配置。" }, 503);
  }

  let password = "";

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
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function buildLoginHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录 Personal Agent</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px; font-family: system-ui, sans-serif; background: #f4f6f8; color: #17181a; }
    main { width: min(380px, 100%); background: #fff; border: 1px solid #dce2ea; border-radius: 8px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0 0 18px; color: #64707d; line-height: 1.5; }
    form { display: grid; gap: 12px; }
    input, button { width: 100%; height: 44px; border-radius: 8px; font: inherit; }
    input { border: 1px solid #cbd2dc; padding: 0 12px; }
    button { border: 0; background: #17181a; color: #fff; font-weight: 650; cursor: pointer; }
    #error { min-height: 20px; color: #a32626; font-size: 14px; margin: 0; }
  </style>
</head>
<body>
  <main>
    <h1>Personal Agent</h1>
    <p>请输入个人访问口令。</p>
    <form id="login-form">
      <input id="password" type="password" autocomplete="current-password" autofocus required />
      <button id="submit" type="submit">登录</button>
      <div id="error" role="alert"></div>
    </form>
  </main>
  <script>
    const form = document.getElementById("login-form");
    const password = document.getElementById("password");
    const submit = document.getElementById("submit");
    const error = document.getElementById("error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = "";
      try {
        const response = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password.value }),
        });
        const data = await response.json();
        if (!response.ok) {
          error.textContent = data.error || "登录失败。";
          return;
        }
        location.href = "/chat";
      } catch {
        error.textContent = "网络请求失败，请稍后再试。";
      } finally {
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
