/**
 * Guide chat storage and scheduling.
 *
 * The guide uses first-party Convex tables plus Vercel AI SDK calls in
 * guideActions.ts. No external agent component is involved.
 */

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const guideAction = v.union(
  v.object({
    action: v.literal("navigate"),
    href: v.string(),
    reason: v.string(),
  }),
  v.object({
    action: v.literal("highlight"),
    selector: v.string(),
    title: v.string(),
    description: v.string(),
  }),
  v.object({
    action: v.literal("control"),
    tool: v.string(),
    inputs: v.any(),
    href: v.string(),
  }),
  v.object({
    action: v.literal("ask"),
    question: v.string(),
  }),
);

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    lang: v.optional(v.string()),
    currentPage: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, prompt, lang, currentPage }) => {
    const messageId = await ctx.db.insert("guideMessages", {
      threadId,
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.guideActions.generateResponse, {
      threadId,
      prompt,
      lang: lang ?? "en",
      currentPage: currentPage ?? "/",
    });

    return messageId;
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, { threadId }) => {
    return await ctx.db
      .query("guideMessages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", threadId))
      .take(100);
  },
});

export const storeAssistantMessage = internalMutation({
  args: {
    threadId: v.string(),
    text: v.string(),
    actions: v.array(guideAction),
  },
  handler: async (ctx, { threadId, text, actions }) => {
    await ctx.db.insert("guideMessages", {
      threadId,
      role: "assistant",
      text,
      actions,
      createdAt: Date.now(),
    });
  },
});

// Cost check ($20/month cap).
export const checkMonthlyCost = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const rows = await ctx.db
      .query("chatUsage")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", monthStart))
      .take(10000);

    let totalCost = 0;
    for (const row of rows) totalCost += row.costUsd;

    return {
      totalCostUsd: totalCost,
      isOverBudget: totalCost >= 20,
      budgetUsd: 20,
    };
  },
});
