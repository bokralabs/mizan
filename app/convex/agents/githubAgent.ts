"use node";
// GitHub Issues agent for Mizan.
// Processes data-correction and stale-data issues in batches,
// integrates with the LLM Council for verification, and handles
// spam prevention + deduplication.

import { internalAction, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

import { callLLMStructured } from "./providers/registry";
import { GitHubIssueClassificationSchema, zodToToolSchema } from "./schemas";
import type { GitHubIssueClassification } from "./schemas";
import { classifySource } from "./council";
import { sanitizeHtml, isUrlTrusted } from "../lib/urlValidator";

const GITHUB_ISSUE_TOOL = zodToToolSchema(
  "classify_github_issue",
  "Classify a GitHub issue as a valid data correction or spam/off-topic, and extract the correction details.",
  GitHubIssueClassificationSchema,
);

const GITHUB_REPO = "bokralabs/mizan";
const GITHUB_API = "https://api.github.com";
const BATCH_LIMIT = 10;
const SPAM_AUTHOR_THRESHOLD = 3;
const MIN_ACCOUNT_AGE_DAYS = 7;
const MAX_ISSUE_BODY_LENGTH = 10_000;

// ─── GITHUB API HELPER ───────────────────────────────────────────────────────

async function githubFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn(
      "[githubAgent] GITHUB_TOKEN not set — skipping GitHub operations"
    );
    return null;
  }
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    console.error(
      `[githubAgent] GitHub API error: ${res.status} ${res.statusText}`
    );
    return null;
  }
  return res.json();
}

// ─── MAIN ORCHESTRATOR ───────────────────────────────────────────────────────

export const processGitHubIssues = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.DISABLE_CRONS === "true") {
      console.log("[githubAgent] Crons disabled, skipping.");
      return null;
    }
    console.log("[githubAgent] Starting batch GitHub Issues processing...");
    const batchId = `batch_${Date.now()}`;

    // Fetch open data correction issues
    const dataIssues = await githubFetch(
      `/repos/${GITHUB_REPO}/issues?state=open&labels=data-correction&per_page=20`
    );

    const allIssues: Array<GitHubIssue> = [];
    if (Array.isArray(dataIssues)) allIssues.push(...(dataIssues as Array<GitHubIssue>));

    if (allIssues.length === 0) {
      console.log("[githubAgent] No open issues found");
      return null;
    }

    console.log(`[githubAgent] Found ${allIssues.length} open issues (batch: ${batchId})`);

    let processed = 0;
    for (const issue of allIssues) {
      if (processed >= BATCH_LIMIT) {
        console.log(`[githubAgent] Batch limit (${BATCH_LIMIT}) reached, remaining issues queued for next run`);
        break;
      }

      // Check if already processed (dedup)
      const existing: Array<{ _id: Id<"githubIssueProcessing">; status: string }> =
        await ctx.runQuery(internal.githubIssueQueries.getByIssueNumber, {
          issueNumber: issue.number,
        });

      if (existing.length > 0) {
        console.log(`[githubAgent] Issue #${issue.number} already tracked (status: ${existing[0].status}), skipping`);
        continue;
      }

      await processDataIssue(ctx, issue, batchId);
      processed++;
    }

    console.log(`[githubAgent] Batch complete: ${processed} issues processed`);
    return null;
  },
});

// ─── DATA ISSUE HANDLER ─────────────────────────────────────────────────────

async function processDataIssue(
  ctx: ActionCtx,
  issue: GitHubIssue,
  batchId: string
): Promise<void> {
  console.log(`[githubAgent] Processing data issue #${issue.number}: ${issue.title}`);

  // ── Input sanitization ──────────────────────────────────────────────────
  // Strip HTML tags and enforce size limits on untrusted input.
  issue.title = sanitizeHtml(issue.title, 500);
  issue.body = sanitizeHtml(issue.body, MAX_ISSUE_BODY_LENGTH);

  if (issue.body.length === 0) {
    console.warn(`[githubAgent] Issue #${issue.number} has empty body after sanitization, skipping`);
    await ctx.runMutation(internal.githubIssueQueries.recordIssue, {
      issueNumber: issue.number,
      issueType: "data" as const,
      status: "spam" as const,
      authorUsername: issue.user?.login ?? "unknown",
      batchId,
    });
    return;
  }

  const authorUsername = issue.user?.login ?? "unknown";

  // Spam check: rate limit per author
  const authorIssues: Array<{ _id: Id<"githubIssueProcessing"> }> =
    await ctx.runQuery(internal.githubIssueQueries.getByAuthor, {
      authorUsername,
    });
  if (authorIssues.length >= SPAM_AUTHOR_THRESHOLD) {
    console.warn(`[githubAgent] Author ${authorUsername} has ${authorIssues.length} open issues, deprioritizing`);
    await ctx.runMutation(internal.githubIssueQueries.recordIssue, {
      issueNumber: issue.number,
      issueType: "data" as const,
      status: "queued" as const,
      authorUsername,
      batchId,
    });
    return;
  }

  // Account age check
  const accountAge = await getAccountAgeDays(authorUsername);

  // Record the issue as processing
  await ctx.runMutation(internal.githubIssueQueries.recordIssue, {
    issueNumber: issue.number,
    issueType: "data" as const,
    status: "processing" as const,
    authorUsername,
    authorAccountAge: accountAge ?? undefined,
    batchId,
  });

  // Parse issue with structured LLM output
  const rawClassification = await callLLMStructured<GitHubIssueClassification>(
    `You are a data verification assistant for an Egyptian government transparency platform called Mizan.

Parse this GitHub issue and classify it as a valid data correction or spam/off-topic.

For valid data corrections, extract:
- page: which page the data is on (e.g., "budget", "debt", "parliament")
- dataPoint: what specific data point is being corrected
- currentValue: what value Mizan currently shows (if mentioned)
- correctValue: what the correct value should be
- sourceUrl: the URL proving the correct value
- confidence: "high" if they provided a specific source URL, "medium" if they described the source, "low" if no source

For spam, feature requests, or anything that is not a data correction, set valid=false and provide a reason.

Issue title: ${issue.title}
Issue body: ${issue.body}`,
    GITHUB_ISSUE_TOOL,
  );

  if (!rawClassification) {
    await addComment(
      issue.number,
      "**Mizan AI Agent**: Unable to process this issue at this time. A maintainer will review it manually.\n\n_This is an automated response._"
    );
    return;
  }

  const verified = GitHubIssueClassificationSchema.safeParse(rawClassification);
  if (!verified.success) {
    console.error(
      `[githubAgent] Zod validation failed for issue #${issue.number}:`,
      verified.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
    return;
  }

  const parsed: GitHubIssueClassification = verified.data;

  // Spam detection
  if (!parsed.valid) {
    await ctx.runMutation(internal.githubIssueQueries.updateIssueStatus, {
      issueNumber: issue.number,
      status: "spam" as const,
    });
    await addComment(
      issue.number,
      `**Mizan AI Agent**: This issue doesn't appear to be a data correction.\n\nReason: ${parsed.reason ?? "unknown"}\n\nIf this is incorrect, please update the issue with more details about which data point needs correction and provide a source URL.\n\n_This is an automated response._`
    );
    await githubFetch(
      `/repos/${GITHUB_REPO}/issues/${issue.number}/labels`,
      { method: "POST", body: JSON.stringify({ labels: ["spam"] }) }
    );
    return;
  }

  const page = parsed.page ?? "government";
  const dataPoint = parsed.dataPoint ?? "";
  const correctValue = parsed.correctValue;
  const currentValue = parsed.currentValue;
  const rawSourceUrl = parsed.sourceUrl;

  // Validate source URL against the trusted-domain allowlist
  let sourceUrl: string | undefined;
  if (rawSourceUrl) {
    if (isUrlTrusted(rawSourceUrl)) {
      sourceUrl = rawSourceUrl;
    } else {
      console.warn(
        `[githubAgent] Issue #${issue.number}: rejected untrusted source URL "${rawSourceUrl}"`,
      );
      sourceUrl = undefined;
    }
  }

  // Update processing record with parsed data
  await ctx.runMutation(internal.githubIssueQueries.updateIssueParsedData, {
    issueNumber: issue.number,
    parsedCategory: page,
    parsedDataPoint: dataPoint,
    parsedSourceUrl: sourceUrl,
  });

  // Account too new — flag for human review regardless
  if (accountAge !== null && accountAge < MIN_ACCOUNT_AGE_DAYS) {
    console.warn(`[githubAgent] Account ${authorUsername} is ${accountAge} days old, flagging for human review`);
    await ctx.runMutation(internal.githubIssueQueries.updateIssueStatus, {
      issueNumber: issue.number,
      status: "council_review" as const,
    });
    await addComment(
      issue.number,
      `**Mizan AI Agent**: Thank you for the report. This issue has been flagged for manual review by a maintainer.\n\n_This is an automated response._`
    );
    await githubFetch(
      `/repos/${GITHUB_REPO}/issues/${issue.number}/labels`,
      { method: "POST", body: JSON.stringify({ labels: ["needs-human-review"] }) }
    );
    return;
  }

  // Create council session
  const sourceType = sourceUrl ? classifySource(sourceUrl) : ("other" as const);
  const category = mapPageToChangeCategory(page);

  const sessionId: Id<"councilSessions"> = await ctx.runMutation(
    internal.council.createCouncilSession,
    {
      triggerType: "github_issue" as const,
      triggerRef: `issue#${issue.number}`,
      category,
      tableName: page,
      fieldName: dataPoint || undefined,
      proposedValue: correctValue,
      currentValue,
      sourceUrl,
      sourceType,
    }
  );

  // Link council session to issue processing
  await ctx.runMutation(internal.githubIssueQueries.linkCouncilSession, {
    issueNumber: issue.number,
    councilSessionId: sessionId,
  });

  // Run council review
  const resolution: { status: string; finalConfidence: string } | null =
    await ctx.runAction(internal.agents.council.runCouncilReview, {
      sessionId,
      category,
      tableName: page,
      fieldName: dataPoint || undefined,
      currentValue,
      proposedValue: correctValue,
      sourceUrl,
      issueBody: issue.body,
    });

  // Post result to GitHub
  if (resolution) {
    const statusEmoji =
      resolution.status === "approved" ? "✅" :
      resolution.status === "rejected" ? "❌" : "⚠️";

    const statusLabel =
      resolution.status === "approved" ? "council-approved" :
      resolution.status === "rejected" ? "council-rejected" : "needs-human-review";

    const confidenceNote =
      resolution.finalConfidence === "low"
        ? "\n\n> Note: This data point will be marked as **estimated** on the site since it comes from a non-governmental source."
        : "";

    await ctx.runMutation(internal.githubIssueQueries.updateIssueStatus, {
      issueNumber: issue.number,
      status: resolution.status === "approved" ? "approved" as const : resolution.status === "rejected" ? "rejected" as const : "council_review" as const,
    });

    await addComment(
      issue.number,
      `**Mizan LLM Council** ${statusEmoji}\n\n**Decision**: ${resolution.status}\n**Confidence**: ${resolution.finalConfidence}\n**Data point**: ${dataPoint}\n**Proposed value**: ${correctValue ?? "(not specified)"}\n**Source**: ${sourceUrl ?? "none provided"}\n**Source type**: ${sourceType}${confidenceNote}\n\n${
        resolution.status === "approved"
          ? "This correction will be applied in the next data refresh cycle."
          : resolution.status === "rejected"
          ? "This correction was not accepted. Please provide a more authoritative source (preferably .gov.eg) if you believe this is incorrect."
          : "This correction requires manual review by a maintainer."
      }\n\n_This decision was made by the Mizan LLM Council. See [/transparency](https://mizanmasr.com/transparency) for the full audit trail._`
    );

    await githubFetch(
      `/repos/${GITHUB_REPO}/issues/${issue.number}/labels`,
      { method: "POST", body: JSON.stringify({ labels: [statusLabel] }) }
    );

    // If approved and from a .gov source, also log to the data refresh audit trail
    if (resolution.status === "approved") {
      const logCategory = mapPageToRefreshCategory(page);
      const refreshLogId: Id<"dataRefreshLog"> = await ctx.runMutation(
        internal.dataRefresh.logRefreshStart,
        { category: logCategory }
      );

      await ctx.runMutation(internal.dataRefresh.logChange, {
        refreshLogId,
        category,
        action: "flagged" as const,
        tableName: page,
        descriptionAr: `تصحيح بيانات معتمد من مجلس الذكاء الاصطناعي — القضية #${issue.number}: ${dataPoint}`,
        descriptionEn: `Council-approved data correction from GitHub Issue #${issue.number}: ${dataPoint}`,
        previousValue: currentValue,
        newValue: correctValue,
        sourceUrl,
      });

      await ctx.runMutation(internal.dataRefresh.logRefreshComplete, {
        logId: refreshLogId,
        recordsUpdated: 0,
        sourceUrl,
      });
    }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  created_at: string;
  user?: { login: string; created_at?: string };
}

async function addComment(issueNumber: number, body: string): Promise<void> {
  await githubFetch(
    `/repos/${GITHUB_REPO}/issues/${issueNumber}/comments`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
}

async function getAccountAgeDays(username: string): Promise<number | null> {
  const user = (await githubFetch(`/users/${username}`)) as {
    created_at?: string;
  } | null;
  if (!user?.created_at) return null;
  const created = new Date(user.created_at);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

async function _verifySource(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function mapPageToRefreshCategory(
  page: string
): "government" | "parliament" | "constitution" | "budget" | "debt" | "all" {
  const map: Record<
    string,
    "government" | "parliament" | "constitution" | "budget" | "debt" | "all"
  > = {
    government: "government",
    parliament: "parliament",
    constitution: "constitution",
    budget: "budget",
    debt: "debt",
    elections: "all",
    economy: "debt",
  };
  return map[page] ?? "government";
}

function mapPageToChangeCategory(
  page: string
): "government" | "parliament" | "constitution" | "budget" | "debt" | "elections" {
  const map: Record<
    string,
    "government" | "parliament" | "constitution" | "budget" | "debt" | "elections"
  > = {
    government: "government",
    parliament: "parliament",
    constitution: "constitution",
    budget: "budget",
    debt: "debt",
    elections: "elections",
    economy: "debt",
  };
  return map[page] ?? "government";
}
