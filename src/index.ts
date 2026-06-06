import { handleMpRequest } from "./mpHandler";
import type { LlmEnv } from "./llmClient";
import type { SupabaseEnv } from "./reminderStore";
import type { OfficialAccountEnv } from "./wechatOfficial";
import { handleWecomRequest, type WecomEnv } from "./wecomHandler";
import {
  handleChatApi,
  handleChatPage,
  handleCancelReminderApi,
  handleDueRemindersApi,
  handleRemindersApi,
  handleMarkReminderSentApi,
} from "./webChat";

export interface Env extends OfficialAccountEnv, WecomEnv, SupabaseEnv, LlmEnv {}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    console.info("Incoming channel request.", {
      method: request.method,
      path: url.pathname,
      queryKeys: [...url.searchParams.keys()],
    });

    if (url.pathname === "/mp") {
      return handleMpRequest(request, env, ctx);
    }

    if (url.pathname === "/wecom") {
      return handleWecomRequest(request, env, ctx);
    }

    if (url.pathname === "/chat") {
      return handleChatPage();
    }

    if (url.pathname === "/api/chat") {
      return handleChatApi(request, env);
    }

    if (url.pathname === "/api/reminders/due") {
      return handleDueRemindersApi(request, env);
    }

    if (url.pathname === "/api/reminders") {
      return handleRemindersApi(request, env);
    }

    const cancelReminderMatch = url.pathname.match(/^\/api\/reminders\/([^/]+)\/cancel$/);

    if (cancelReminderMatch) {
      return handleCancelReminderApi(request, env, decodeURIComponent(cancelReminderMatch[1]));
    }

    const markReminderSentMatch = url.pathname.match(/^\/api\/reminders\/([^/]+)\/mark-sent$/);

    if (markReminderSentMatch) {
      return handleMarkReminderSentApi(request, env, decodeURIComponent(markReminderSentMatch[1]));
    }

    if (url.pathname === "/") {
      return new Response("Personal Agent Worker is running. Use /chat, /api/chat, /mp or /wecom.");
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
