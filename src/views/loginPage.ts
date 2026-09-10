export function buildLoginHtml(): string {
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
