import { listUIMessages, saveMessage, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    lang: v.string(),
  },
  handler: async (ctx, args) => {
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      prompt: args.prompt,
    });
    await ctx.scheduler.runAfter(0, internal.uiAgent.generateResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
      prompt: args.prompt,
      lang: args.lang,
    });
    return messageId;
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
      includeStatuses: ["streaming", "finished", "aborted"],
    });
    return { ...paginated, streams };
  },
});
