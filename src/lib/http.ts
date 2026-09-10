export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function readRequiredSearchParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);

  if (!value) {
    throw new Error(`Missing required search parameter: ${key}.`);
  }

  return value;
}
