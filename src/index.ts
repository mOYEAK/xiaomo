import {
  handleCancelReminderApi,
  handleChatApi,
  handleChatPage,
  handleDeleteMemoApi,
  handleDueRemindersApi,
  handleMemosApi,
  handleRemindersApi,
  handleMarkReminderSentApi,
} from "./channels/web/chatApi";
import {
  handleLoginRequest,
  handleLogoutRequest,
  hasAuthConfig,
  isAuthenticated,
  unauthorizedResponse,
} from "./channels/web/auth";
import { handleMpRequest } from "./channels/mp/mpHandler";
import { handleWecomRequest } from "./channels/wecom/wecomHandler";
import { jsonResponse } from "./lib/http";
import type { AppEnv } from "./config/env";

export type Env = AppEnv;

type RouteHandler = (
  request: Request,
  env: AppEnv,
  match: RegExpMatchArray,
) => Promise<Response> | Response;

interface Route {
  pattern: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [
  // 公开路由：登录、健康检查（微信通道在 fetch 中单独分发，需要 ExecutionContext）
  {
    pattern: /^\/$/,
    handler: () => new Response("Personal Agent Worker is running."),
  },
  { pattern: /^\/login$/, handler: handleLoginRequest },
  { pattern: /^\/logout$/, handler: handleLogoutRequest },
  // H5 页面
  { pattern: /^\/chat$/, handler: handleChatPage },
  // H5 API
  { pattern: /^\/api\/chat$/, handler: handleChatApi },
  { pattern: /^\/api\/memos$/, handler: handleMemosApi },
  {
    pattern: /^\/api\/memos\/([^/]+)\/delete$/,
    handler: (request, env, match) =>
      handleDeleteMemoApi(request, env, decodeURIComponent(match[1])),
  },
  { pattern: /^\/api\/reminders$/, handler: handleRemindersApi },
  { pattern: /^\/api\/reminders\/due$/, handler: handleDueRemindersApi },
  {
    pattern: /^\/api\/reminders\/([^/]+)\/cancel$/,
    handler: (request, env, match) =>
      handleCancelReminderApi(request, env, decodeURIComponent(match[1])),
  },
  {
    pattern: /^\/api\/reminders\/([^/]+)\/mark-sent$/,
    handler: (request, env, match) =>
      handleMarkReminderSentApi(request, env, decodeURIComponent(match[1])),
  },
];

const publicPaths = new Set(["/", "/login", "/logout", "/mp", "/wecom"]);

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    console.info("Incoming request.", {
      method: request.method,
      pathname: url.pathname,
    });

    // 微信通道需要 ExecutionContext，单独分发
    if (url.pathname === "/mp") {
      return handleMpRequest(request, env, ctx);
    }
    if (url.pathname === "/wecom") {
      return handleWecomRequest(request, env, ctx);
    }

    // H5 受保护区域鉴权
    if (
      !publicPaths.has(url.pathname) &&
      hasAuthConfig(env) &&
      !(await isAuthenticated(request, env))
    ) {
      return unauthorizedResponse(request);
    }

    const route = routes
      .map((candidate) => ({
        candidate,
        match: url.pathname.match(candidate.pattern),
      }))
      .find((entry) => entry.match);

    if (!route?.match) {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    return route.candidate.handler(request, env, route.match);
  },
};
