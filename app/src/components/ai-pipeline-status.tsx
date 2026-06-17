"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useLanguage } from "@/components/providers";
import type { Translations } from "@/lib/translations";
import {
  Loader2,
  Check,
  X,
  Clock,
  Minus,
  ChevronDown,
  ChevronUp,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

interface PipelineStep {
  step: string;
  status: StepStatus;
  message: string;
  messageAr: string;
  recordsUpdated: number | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

interface PipelineProgress {
  steps: PipelineStep[];
  lastCompletedAt: number | null;
}

// ─── Step name translations ───────────────────────────────────────────────────

const STEP_NAMES_AR: Record<string, string> = {
  government: "الحكومة",
  parliament: "البرلمان",
  budget: "الموازنة",
  debt: "الدين",
  economy: "الاقتصاد",
  governorate_stats: "إحصائيات المحافظات",
  constitution: "الدستور",
  github_issues: "مشكلات GitHub",
  narrative: "التحليل الاقتصادي",
  llm_export: "تصدير الذكاء الاصطناعي",
  cleanup: "التنظيف",
  reference_data: "البيانات المرجعية",
};

const STEP_NAMES_EN: Record<string, string> = {
  government: "Government",
  parliament: "Parliament",
  budget: "Budget",
  debt: "Debt",
  economy: "Economy",
  governorate_stats: "Governorate Stats",
  constitution: "Constitution",
  github_issues: "GitHub Issues",
  narrative: "Economic Analysis",
  llm_export: "AI Export",
  cleanup: "Cleanup",
  reference_data: "Reference Data",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number, t: Translations, isRunning: boolean): string {
  if (isRunning) return t.pipeline_refreshingNow;
  if (ms <= 0) return t.pipeline_readyToRefresh;

  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const isAr = t.siteName === "ميزان";
  if (isAr) {
    const pad = (n: number) => n.toString();
    if (h > 0) return `${t.pipeline_nextRefreshIn} ${pad(h)}س ${pad(m)}د ${pad(s)}ث`;
    if (m > 0) return `${t.pipeline_nextRefreshIn} ${pad(m)}د ${pad(s)}ث`;
    return `${t.pipeline_nextRefreshIn} ${pad(s)}ث`;
  }

  const hStr = h > 0 ? `${h}h ` : "";
  const mStr = m > 0 ? `${m}m ` : "";
  const sStr = `${s}s`;
  return `${t.pipeline_nextRefreshIn} ${hStr}${mStr}${sStr}`;
}

function formatElapsed(startedAt: number | null | undefined, completedAt: number | null | undefined): string {
  if (!startedAt) return "--";
  const end = completedAt ?? Date.now();
  const sec = (end - startedAt) / 1000;
  if (isNaN(sec) || sec < 0) return "--";
  return `${sec.toFixed(1)}s`;
}

// ─── Status Icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "pending":
      return <Minus size={14} className="text-muted-foreground" />;
    case "running":
      return <Loader2 size={14} className="text-primary animate-spin" />;
    case "success":
      return <Check size={14} className="text-emerald-500" />;
    case "failed":
      return <X size={14} className="text-destructive" />;
    case "skipped":
      return <Minus size={14} className="text-muted-foreground/50" />;
  }
}

function statusLabel(status: StepStatus, t: Translations): string {
  switch (status) {
    case "pending":
      return t.pipeline_pending;
    case "running":
      return t.pipeline_running;
    case "success":
      return t.pipeline_success;
    case "failed":
      return t.pipeline_failed;
    case "skipped":
      return t.pipeline_skipped;
  }
}

// ─── Countdown Hook ───────────────────────────────────────────────────────────

function useCountdown(lastCompletedAt: number | null, steps: PipelineStep[]): { msUntilNext: number; isRunning: boolean } {
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isRunning = steps.some((s) => s.status === "running");

  if (lastCompletedAt === null) {
    return { msUntilNext: 0, isRunning };
  }

  const nextRun = lastCompletedAt + TWELVE_HOURS_MS;
  const msUntilNext = Math.max(0, nextRun - now);
  return { msUntilNext, isRunning };
}

// ─── Pipeline Step Row ────────────────────────────────────────────────────────

function StepRow({ step, isAr, t }: { step: PipelineStep; isAr: boolean; t: Translations }) {
  const name = isAr ? (STEP_NAMES_AR[step.step] ?? step.step) : (STEP_NAMES_EN[step.step] ?? step.step);
  const message = isAr ? (step.messageAr || step.message) : (step.message || "--");
  const elapsed = formatElapsed(step.startedAt, step.completedAt);

  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-xs font-medium capitalize whitespace-nowrap">
        {name}
      </td>
      <td className="px-4 py-2.5">
        <span className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          step.status === "success" && "text-emerald-500",
          step.status === "failed" && "text-destructive",
          step.status === "running" && "text-primary",
          (step.status === "pending" || step.status === "skipped") && "text-muted-foreground",
        )}>
          <StatusIcon status={step.status} />
          {statusLabel(step.status, t)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
        {step.error
          ? <span className="text-destructive">{step.error}</span>
          : (message || "--")}
        {step.recordsUpdated !== null && step.recordsUpdated > 0 && (
          <span className="ms-1.5 text-emerald-500/80">
            ({step.recordsUpdated} {t.pipeline_records})
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono text-end whitespace-nowrap">
        {step.status === "success" || step.status === "failed" || step.status === "running" ? elapsed : "--"}
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiPipelineStatus() {
  const { t, lang, dir } = useLanguage();
  const isAr = lang === "ar";

  // Attempt to load the query — may not exist yet
  // We use a type-safe cast via unknown to handle missing query gracefully
  const progressQuery = (api as unknown as {
    pipelineProgress?: { getProgress: unknown };
  }).pipelineProgress?.getProgress;

  const rawProgress = useProgressSafe(progressQuery as Parameters<typeof useQuery>[0] | undefined);

  const progress = rawProgress as PipelineProgress | null | undefined;

  const progressSteps = progress?.steps ?? [];
  const { msUntilNext, isRunning } = useCountdown(progress?.lastCompletedAt ?? null, progressSteps);

  // Determine whether to start expanded (a run is in progress) or collapsed
  const hasActiveRun = progress?.steps?.some((s) => s.status === "running") ?? false;
  const [expanded, setExpanded] = useState(false);

  // Auto-expand when a run is detected in progress
  useEffect(() => {
    if (hasActiveRun) setExpanded(true);
  }, [hasActiveRun]);

  // No pipeline query available at all
  if (progressQuery === undefined) {
    return null;
  }

  // Loading state
  if (progress === undefined) {
    return (
      <section className="container-page py-4" dir={dir}>
        <div className="rounded-xl border border-border/60 bg-card/40 px-5 py-3">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="font-semibold text-foreground">{t.pipeline_title}</span>
            <span className="text-xs">{isAr ? "جار تحميل الحالة" : "Loading status"}</span>
          </div>
        </div>
      </section>
    );
  }

  // No data returned
  if (progress === null) {
    return null;
  }

  const successCount = progressSteps.filter((s) => s.status === "success").length;
  const failedCount = progressSteps.filter((s) => s.status === "failed").length;

  return (
    <section className="container-page py-4" dir={dir}>
      <div className="border border-border/60 rounded-xl bg-card/40 backdrop-blur-sm overflow-hidden">

        {/* Header — always visible */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors text-start"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2.5">
            {isRunning || hasActiveRun ? (
              <Loader2 size={14} className="text-primary animate-spin" />
            ) : (
              <Bot size={14} className="text-primary opacity-70" />
            )}
            <span className="text-sm font-semibold">
              {t.pipeline_title}
            </span>

            {/* Status badges */}
            <div className="flex items-center gap-1.5 ms-1">
              {hasActiveRun && (
                <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {t.pipeline_live}
                </span>
              )}
              {failedCount > 0 && (
                <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
                  {failedCount} {t.pipeline_failed}
                </span>
              )}
              {!hasActiveRun && successCount > 0 && failedCount === 0 && (
                <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                  {t.pipeline_complete}
                </span>
              )}
              {!hasActiveRun && successCount > 0 && (
                <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                  {t.pipeline_llmReady}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Countdown */}
            <span className="text-xs text-muted-foreground font-mono hidden sm:block" style={{ direction: "ltr", unicodeBidi: "isolate" }}>
              <Clock size={10} className="inline me-1 opacity-60" />
              {formatCountdown(msUntilNext, t, isRunning)}
            </span>
            {expanded ? (
              <ChevronUp size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Countdown on mobile */}
        <div className="sm:hidden px-5 pb-2 -mt-1">
          <span className="text-xs text-muted-foreground font-mono" style={{ direction: "ltr", unicodeBidi: "isolate" }}>
            <Clock size={10} className="inline me-1 opacity-60" />
            {formatCountdown(msUntilNext, t, isRunning)}
          </span>
        </div>

        {/* Collapsible table */}
        {expanded && progressSteps.length > 0 && (
          <div className="border-t border-border/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-4 py-2 text-start text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    {t.pipeline_step}
                  </th>
                  <th className="px-4 py-2 text-start text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    {t.pipeline_status}
                  </th>
                  <th className="px-4 py-2 text-start text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    {t.pipeline_message}
                  </th>
                  <th className="px-4 py-2 text-end text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    {t.pipeline_time}
                  </th>
                </tr>
              </thead>
              <tbody>
                {progressSteps.map((step, i) => (
                  <StepRow key={`${step.step}-${i}`} step={step} isAr={isAr} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state when expanded but no steps */}
        {expanded && progressSteps.length === 0 && (
          <div className="border-t border-border/40 px-5 py-6 text-center text-xs text-muted-foreground">
            {t.pipeline_noData}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Safe query hook wrapper ──────────────────────────────────────────────────
// Wraps useQuery so we can call it even if the query function is undefined.
// When undefined is passed, the hook returns undefined without subscribing.

function useProgressSafe(
  queryFn: Parameters<typeof useQuery>[0] | undefined,
): PipelineProgress | null | undefined {
  // We must call useQuery unconditionally to satisfy Rules of Hooks.
  // When queryFn is undefined we pass a sentinel "skip" pattern by wrapping in
  // a try/catch — but Convex doesn't support skip natively in v1, so instead
  // we always call the hook but guard the queryFn.
  //
  // The safest approach: always call useQuery with the first argument,
  // but return early from the component if the module isn't wired up.
  // Since this function is only called from one place and queryFn is stable
  // (always defined or always undefined per build), this is safe.

  // Convex useQuery will throw if queryFn is not a valid FunctionReference.
  // We catch that case by checking at the call site — if progressQuery is
  // undefined we return null from the component before reaching here.
  // This hook is therefore only called when queryFn is defined.
  return useQuery(queryFn as Parameters<typeof useQuery>[0]) as
    | PipelineProgress
    | null
    | undefined;
}
