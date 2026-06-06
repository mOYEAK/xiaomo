export interface WebDocument {
  url: string;
  content: string;
  truncated: boolean;
}

export interface WebReader {
  read(url: string): Promise<WebDocument>;
}

export interface WebReaderOptions {
  timeoutMs?: number;
  maxCharacters?: number;
}

export class WebReaderError extends Error {
  constructor(
    message: string,
    readonly code: "access_restricted" | "unavailable",
  ) {
    super(message);
    this.name = "WebReaderError";
  }
}

const urlPattern = /https?:\/\/[^\s<>"'\u3002\uff0c\uff01\uff1f\uff1b\uff09\]]+/i;
const jinaReaderPrefix = "https://r.jina.ai/";

export function extractFirstUrl(text: string): string | undefined {
  return text.match(urlPattern)?.[0];
}

export function buildJinaReaderUrl(url: string): string {
  if (url.startsWith(jinaReaderPrefix)) {
    return url;
  }

  return `${jinaReaderPrefix}${url}`;
}

export function createJinaWebReader(options: WebReaderOptions = {}): WebReader {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxCharacters = options.maxCharacters ?? 20_000;

  return {
    async read(url) {
      if (isKnownPrivateUrl(url)) {
        throw new WebReaderError("Web page is a private chat URL.", "access_restricted");
      }

      try {
        return await readDocument(buildJinaReaderUrl(url), url, timeoutMs, maxCharacters, false);
      } catch (jinaError) {
        if (jinaError instanceof WebReaderError && jinaError.code === "access_restricted") {
          throw jinaError;
        }

        try {
          return await readDocument(url, url, timeoutMs, maxCharacters, true);
        } catch (directError) {
          throw new WebReaderError(
            `Web reader failed: Jina=${toErrorMessage(jinaError)}; direct=${toErrorMessage(directError)}`,
            "unavailable",
          );
        }
      }
    },
  };
}

function isKnownPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "doubao.com" || parsed.hostname === "www.doubao.com") &&
      parsed.pathname.startsWith("/chat/")
    );
  } catch {
    return false;
  }
}

async function readDocument(
  requestUrl: string,
  originalUrl: string,
  timeoutMs: number,
  maxCharacters: number,
  stripHtml: boolean,
): Promise<WebDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: stripHtml ? "text/html, text/plain;q=0.9, */*;q=0.1" : "text/markdown, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "Personal-Agent-Web-Reader/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`request failed: ${response.status} ${response.statusText}`);
    }

    const rawContent = (await response.text()).trim();
    const content = stripHtml ? htmlToText(rawContent) : rawContent;

    if (isAccessRestricted(content)) {
      throw new WebReaderError("Web page requires login or has access restrictions.", "access_restricted");
    }

    if (!content) {
      throw new Error("reader returned empty content");
    }

    return {
      url: originalUrl,
      content: content.slice(0, maxCharacters),
      truncated: content.length > maxCharacters,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAccessRestricted(content: string): boolean {
  const normalized = content.toLowerCase();
  return [
    "\u8bf7\u5148\u767b\u5f55",
    "\u9700\u8981\u767b\u5f55",
    "\u767b\u5f55\u540e\u67e5\u770b",
    "\u53d7\u533a\u57df\u9650\u5236",
    "sign in to continue",
    "log in to continue",
    "login required",
    "access denied",
  ].some((marker) => normalized.includes(marker));
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
