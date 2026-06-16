"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { defineCatalog } from "@json-render/core";
import { Renderer, StateProvider, ActionProvider, VisibilityProvider, defineRegistry } from "@json-render/react";
import { schema as jsonRenderReactSchema } from "@json-render/react/schema";
import {
  ArrowUp,
  ArrowUpRight,
  Building2,
  Calculator,
  ExternalLink,
  Landmark,
  MessageSquareText,
  RotateCcw,
  Scale,
  Users,
} from "lucide-react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { AiPipelineStatus } from "@/components/ai-pipeline-status";
import { SanadBadge } from "@/components/sanad-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/components/providers";
import { fmtEGP, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

type Lang = "en" | "ar";
type Intent = "overview" | "budget" | "debt" | "government" | "sources" | "investment" | "comparison";
type BlockKind = "kpi" | "budgetBars" | "debtSplit" | "entityGrid" | "sourceList" | "findingSteps" | "investmentLens" | "toolLauncher" | "indicatorStrip";
type Tone = "primary" | "blue" | "teal" | "red" | "purple";
type MetricKey = "ministries" | "parliament" | "debtTotal" | "debtGdp" | "budgetDeficit" | "budgetSpending";
type InvestmentIndicatorKey =
  | "egx30_annual_return"
  | "egypt_real_estate_return"
  | "gold_annual_return"
  | "cbe_cd_rate"
  | "egypt_tbill_rate"
  | "inflation"
  | "exchange_rate"
  | "egypt_mortgage_rate";

type StatSource = {
  sourceUrl: string;
  sanadLevel: number;
};

type HomeStats = {
  parliamentarians: StatSource & { value: number; house: number; senate: number };
  governorates: StatSource & { value: number };
  constitutionArticles: StatSource & { value: number };
  ministries: StatSource & { value: number };
  externalDebt: (StatSource & { value: number }) | null;
  domesticDebt: (StatSource & { value: number }) | null;
  totalDebt: (StatSource & { value: number; debtToGdpRatio: number | null }) | null;
  budget: (StatSource & {
    year: string;
    totalRevenue: number;
    totalExpenditure: number;
    deficit: number;
  }) | null;
};

type InvestmentDefaults = Partial<Record<InvestmentIndicatorKey, {
  value: number;
  unit: string;
  date: string;
  sanadLevel: number;
  sourceUrl?: string;
}>>;

type BoardBlock = {
  id: string;
  kind: BlockKind;
  span: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  metric?: MetricKey;
  tone?: Tone;
  title: string;
  description: string;
  indicators: InvestmentIndicatorKey[];
  action?: {
    label: string;
    href: string;
  };
};

type Board = {
  intent: Intent;
  lang: Lang;
  operation: "replace" | "append" | "update" | "focus";
  title: string;
  chatReply: string;
  answer: string;
  notation: string;
  plan: string[];
  blocks: BoardBlock[];
  focusBlockId: string | null;
  suggestions: string[];
  planner: "llm";
  model: string;
};

type Turn = {
  id: string;
  prompt: string;
  board: Board | null;
  status: "planning" | "done" | "error";
  error?: string;
  createdAt: number;
};

type RenderPhase = "idle" | "planning" | "rendering" | "done";

type PlannerHistory = {
  role: "user" | "assistant";
  content: string;
};

type UiGridPlanBlock = {
  id: string;
  kind: BlockKind;
  span: BoardBlock["span"];
  metric: MetricKey | null;
  title: string;
  description: string;
  indicators: InvestmentIndicatorKey[];
  action: {
    label: string;
    href: string;
  } | null;
};

type UiGridPlan = {
  schemaVersion: "mzn-grid-v1";
  language: Lang;
  intent: Intent;
  operation: "replace" | "append" | "update" | "focus";
  title: string;
  chatReply: string;
  answer: string;
  plan: string[];
  blocks: UiGridPlanBlock[];
  focusBlockId: string | null;
  suggestions: string[];
  planner: "llm";
  model: string;
};

const COPY = {
  en: {
    title: "Mizan",
    subtitle: "Ask about Egypt's public data.",
    placeholder: "Ask about debt, budget, government, or sources...",
    reset: "Reset",
    history: "History",
    plan: "Plan",
    source: "Source",
    ask: "Ask",
    empty: "Start with a question. Mizan will assemble a sourced board.",
    examples: [
      "Show debt status",
      "Show the budget gap",
      "Who runs what?",
      "Can I trust the sources?",
    ],
    labels: {
      budget: "Budget",
      debt: "Debt",
      government: "Government",
      parliament: "Parliament",
      governorates: "Governorates",
      constitution: "Constitution",
      revenue: "Revenue",
      spending: "Spending",
      deficit: "Deficit",
      external: "External",
      domestic: "Domestic",
      ministries: "ministries",
      members: "members",
      regions: "regions",
      articles: "articles",
      debtToGdp: "Debt to GDP",
      totalDebt: "Total debt",
    },
  },
  ar: {
    title: "ميزان",
    subtitle: "اسأل عن بيانات مصر العامة.",
    placeholder: "اسأل عن الدين أو الموازنة أو الحكومة أو المصادر...",
    reset: "إعادة",
    history: "المحادثة",
    plan: "الخطة",
    source: "المصدر",
    ask: "اسأل",
    empty: "ابدأ بسؤال. ميزان سيبني لوحة موثقة بالمصادر.",
    examples: [
      "اعرض وضع الدين",
      "أظهر فجوة الموازنة",
      "من يدير ماذا؟",
      "هل المصادر موثوقة؟",
    ],
    labels: {
      budget: "الموازنة",
      debt: "الدين",
      government: "الحكومة",
      parliament: "البرلمان",
      governorates: "المحافظات",
      constitution: "الدستور",
      revenue: "الإيرادات",
      spending: "المصروفات",
      deficit: "العجز",
      external: "خارجي",
      domestic: "محلي",
      ministries: "وزارة",
      members: "عضو",
      regions: "محافظة",
      articles: "مادة",
      debtToGdp: "الدين للناتج",
      totalDebt: "إجمالي الدين",
    },
  },
} as const;

const mizanJsonCatalog = defineCatalog(jsonRenderReactSchema, {
  components: {
    BoardRoot: {
      props: z.object({}),
      description: "Root section for a generated Mizan data view.",
    },
    BoardHeader: {
      props: z.object({}),
      description: "Header with title, answer, and language toggle.",
    },
    BoardGrid: {
      props: z.object({}),
      description: "Responsive 12-column grid for generated data blocks.",
    },
    BoardBlock: {
      props: z.object({
        blockId: z.string(),
      }),
      description: "A generated Mizan block selected from the deterministic block registry.",
    },
    BoardSuggestions: {
      props: z.object({}),
      description: "Follow-up prompt suggestions for the current generated view.",
    },
  },
  actions: {},
});

type MizanJsonSpec = {
  root: string;
  elements: Record<string, {
    type: "BoardRoot" | "BoardHeader" | "BoardGrid" | "BoardBlock" | "BoardSuggestions";
    props: Record<string, unknown>;
    children?: string[];
  }>;
  state?: Record<string, unknown>;
};

const TURN_STORAGE_KEY = "mizan-ai-grid-turns-v1";

function appHrefForMetric(metric: MetricKey | undefined): string {
  if (metric === "ministries") return "/government";
  if (metric === "parliament") return "/parliament";
  if (metric === "budgetDeficit" || metric === "budgetSpending") return "/budget";
  if (metric === "debtTotal" || metric === "debtGdp") return "/debt";
  return "/transparency";
}

function EvidenceLinks({
  source,
  appHref,
  lang,
  className,
}: {
  source: StatSource | null | undefined;
  appHref: string;
  lang: Lang;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      <Link
        href={appHref}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] border border-border/70 bg-background/70 px-2 text-[0.65rem] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary"
      >
        {lang === "ar" ? "صفحة" : "Page"}
        <ArrowUpRight size={10} />
      </Link>
      {source && (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={lang === "ar" ? "افتح المصدر الأصلي" : "Open original source"}
          className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/70 px-2 text-[0.65rem] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary"
        >
          <SanadBadge sanadLevel={source.sanadLevel} showLabel focusable={false} />
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function moneyBillions(value: number): string {
  return fmtEGP(value * 1_000_000_000, { compact: true, decimals: 1 });
}

function chartHoverLabel(label: string, value: string, detail: string, lang: Lang): string {
  return lang === "ar"
    ? `${label}: ${value}. ${detail}`
    : `${label}: ${value}. ${detail}`;
}

function turnStatusLabel(turn: Turn, lang: Lang): string {
  if (turn.status === "planning") return lang === "ar" ? "يبني الواجهة" : "Building view";
  if (turn.status === "error") return lang === "ar" ? "تعذر العرض" : "Render failed";
  return lang === "ar" ? "تم العرض" : "Rendered";
}

function blockCountLabel(count: number, lang: Lang): string {
  return lang === "ar" ? `${count} عناصر` : `${count} blocks`;
}

function toneForMetric(metric: MetricKey | undefined): Tone {
  if (metric === "debtTotal" || metric === "budgetDeficit") return "red";
  if (metric === "debtGdp") return "purple";
  if (metric === "budgetSpending") return "blue";
  if (metric === "parliament") return "blue";
  return "primary";
}

function boardFromPlan(plan: UiGridPlan): Board {
  const blocks = plan.blocks.map((item) => ({
    id: item.id,
    kind: item.kind,
    span: item.span,
    metric: item.metric ?? undefined,
    title: item.title,
    description: item.description,
    indicators: item.indicators,
    action: item.action ?? undefined,
    tone: toneForMetric(item.metric ?? undefined),
  }));
  const notation = [
    plan.schemaVersion,
    `intent=${plan.intent}`,
    `lang=${plan.language}`,
    "grid=12",
    blocks.map((blockItem) => `${blockItem.kind}:${blockItem.id}@${blockItem.span}`).join(" "),
  ].join(" | ");

  return {
    intent: plan.intent,
    lang: plan.language,
    operation: plan.operation,
    title: plan.title,
    chatReply: plan.chatReply,
    answer: plan.answer,
    notation,
    plan: plan.plan,
    blocks,
    focusBlockId: plan.focusBlockId,
    suggestions: plan.suggestions,
    planner: "llm",
    model: plan.model,
  };
}

function makeUniqueBlockId(blockId: string, usedIds: Set<string>): string {
  if (!usedIds.has(blockId)) {
    usedIds.add(blockId);
    return blockId;
  }

  let index = 2;
  let next = `${blockId}-${index}`;
  while (usedIds.has(next)) {
    index += 1;
    next = `${blockId}-${index}`;
  }
  usedIds.add(next);
  return next;
}

function blockIdentity(block: BoardBlock): string {
  if (block.metric) return `${block.kind}:${block.metric}`;
  if (block.indicators.length > 0) return `${block.kind}:${[...block.indicators].sort().join(",")}`;
  if (block.action?.href) return `${block.kind}:${block.action.href}`;
  if (["budgetBars", "debtSplit", "entityGrid", "sourceList"].includes(block.kind)) return block.kind;
  return `${block.kind}:${block.title.trim().toLowerCase()}`;
}

function buildBoardNotation(board: Omit<Board, "notation">): string {
  return [
    "json-render",
    `op=${board.operation}`,
    `intent=${board.intent}`,
    `lang=${board.lang}`,
    "grid=12",
    board.blocks.map((item) => `${item.kind}:${item.id}@${item.span}`).join(" "),
  ].join(" | ");
}

function boardToJsonSpec(board: Board, visibleBlockCount: number): MizanJsonSpec {
  const visibleBlocks = board.blocks.slice(0, visibleBlockCount);
  const blockIds = visibleBlocks.map((block) => `block-${block.id}`);
  const elements: MizanJsonSpec["elements"] = {
    root: {
      type: "BoardRoot",
      props: {},
      children: ["header", "grid", "suggestions"],
    },
    header: {
      type: "BoardHeader",
      props: {},
      children: [],
    },
    grid: {
      type: "BoardGrid",
      props: {},
      children: blockIds,
    },
    suggestions: {
      type: "BoardSuggestions",
      props: {},
      children: [],
    },
  };

  for (const block of visibleBlocks) {
    elements[`block-${block.id}`] = {
      type: "BoardBlock",
      props: { blockId: block.id },
      children: [],
    };
  }

  return {
    root: "root",
    elements,
    state: {
      intent: board.intent,
      language: board.lang,
      visibleBlockCount,
      blockCount: board.blocks.length,
    },
  };
}

function hasFreshStartIntent(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(reset|clear|wipe|start over|from scratch|new page|fresh page|fresh board|new board)\b/.test(normalized)
    || /(?:امسح|اعادة|إعادة|ابدأ من جديد|ابدا من جديد|من الأول|من الاول|صفحة جديدة|لوحة جديدة)/.test(normalized);
}

function preservePlanOperation(plan: UiGridPlan, currentBoard: Board | null, prompt: string): UiGridPlan {
  if (!currentBoard) {
    return plan.operation === "replace" ? plan : { ...plan, operation: "replace" };
  }

  if (plan.operation === "replace" && !hasFreshStartIntent(prompt)) {
    return { ...plan, operation: "update" };
  }

  return plan;
}

function mergeBoard(existing: Board | null, incoming: Board): Board {
  if (!existing || incoming.operation === "replace") {
    return incoming;
  }

  let firstNewBlockId: string | null = null;
  const blocks = (() => {
    if (incoming.operation === "append") {
      const usedIds = new Set(existing.blocks.map((item) => item.id));
      const usedIdentities = new Map(existing.blocks.map((item) => [blockIdentity(item), item.id]));
      let firstExistingMatchId: string | null = null;
      const incomingBlocks: BoardBlock[] = [];

      for (const item of incoming.blocks) {
        const identity = blockIdentity(item);
        const existingMatch = usedIds.has(item.id) ? item.id : usedIdentities.get(identity);
        if (existingMatch) {
          firstExistingMatchId ??= existingMatch;
          continue;
        }

        const nextBlock = {
          ...item,
          id: makeUniqueBlockId(item.id, usedIds),
        };
        incomingBlocks.push(nextBlock);
        usedIdentities.set(blockIdentity(nextBlock), nextBlock.id);
      }

      firstNewBlockId = incomingBlocks[0]?.id ?? null;
      if (!firstNewBlockId) firstNewBlockId = firstExistingMatchId;
      return [...existing.blocks, ...incomingBlocks];
    }

    if (incoming.operation === "update") {
      const byId = new Map(incoming.blocks.map((item) => [item.id, item]));
      const updated = existing.blocks.map((item) => byId.get(item.id) ?? item);
      const existingIds = new Set(updated.map((item) => item.id));
      const newBlocks = incoming.blocks.filter((item) => !existingIds.has(item.id));
      firstNewBlockId = newBlocks[0]?.id ?? null;
      return [...updated, ...newBlocks];
    }

    if (incoming.operation === "focus") {
      return existing.blocks;
    }

    const usedIds = new Set(existing.blocks.map((item) => item.id));
    const incomingBlocks = incoming.blocks.map((item) => ({
      ...item,
      id: makeUniqueBlockId(item.id, usedIds),
    }));
    firstNewBlockId = incomingBlocks[0]?.id ?? null;
    return incomingBlocks.length > 0 ? [...existing.blocks, ...incomingBlocks] : existing.blocks;
  })();

  const merged: Omit<Board, "notation"> = {
    ...incoming,
    title: incoming.title || existing.title,
    answer: incoming.answer || existing.answer,
    plan: incoming.plan.length > 0 ? incoming.plan : existing.plan,
    blocks,
    focusBlockId: incoming.operation === "append"
      ? firstNewBlockId ?? incoming.focusBlockId
      : incoming.focusBlockId ?? firstNewBlockId,
    suggestions: incoming.suggestions.length > 0 ? incoming.suggestions : existing.suggestions,
  };

  return {
    ...merged,
    notation: buildBoardNotation(merged),
  };
}

function viewSnapshot(board: Board | null) {
  if (!board) return undefined;
  return {
    title: board.title,
    intent: board.intent,
    language: board.lang,
    answer: board.answer,
    blocks: board.blocks.map((item) => ({
      id: item.id,
      kind: item.kind,
      span: item.span,
      metric: item.metric,
      title: item.title,
      description: item.description,
      indicators: item.indicators,
    })),
    suggestions: board.suggestions,
  };
}

function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(TURN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Turn => {
      if (typeof item !== "object" || item === null) return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === "string" && typeof row.prompt === "string" && typeof row.createdAt === "number";
    });
  } catch {
    return [];
  }
}

function MetricCard({ block, stats, lang }: { block: BoardBlock; stats: HomeStats | undefined; lang: Lang }) {
  const c = COPY[lang].labels;
  const toneClass: Record<Tone, string> = {
    primary: "text-primary",
    blue: "text-chart-2",
    teal: "text-chart-3",
    red: "text-destructive",
    purple: "text-chart-5",
  };

  const metric = (() => {
    switch (block.metric) {
      case "ministries":
        return { label: c.government, value: `${stats?.ministries.value.toLocaleString() ?? "..."} ${c.ministries}`, source: stats?.ministries };
      case "parliament":
        return { label: c.parliament, value: `${stats?.parliamentarians.value.toLocaleString() ?? "..."} ${c.members}`, source: stats?.parliamentarians };
      case "debtTotal":
        return { label: c.totalDebt, value: stats?.totalDebt ? fmtUSD(stats.totalDebt.value, { compact: true, decimals: 1 }) : "...", source: stats?.totalDebt };
      case "debtGdp":
        return { label: c.debtToGdp, value: stats?.totalDebt?.debtToGdpRatio != null ? `${stats.totalDebt.debtToGdpRatio.toFixed(1)}%` : "...", source: stats?.totalDebt };
      case "budgetDeficit":
        return { label: c.deficit, value: stats?.budget ? moneyBillions(Math.abs(stats.budget.deficit)) : "...", source: stats?.budget };
      case "budgetSpending":
        return { label: c.spending, value: stats?.budget ? moneyBillions(stats.budget.totalExpenditure) : "...", source: stats?.budget };
      default:
        return { label: c.budget, value: "...", source: null };
    }
  })();

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">{block.title || metric.label}</p>
        <EvidenceLinks source={metric.source} appHref={appHrefForMetric(block.metric)} lang={lang} />
      </div>
      <p className={cn("mt-5 font-mono text-2xl font-black tabular-nums", toneClass[block.tone ?? "primary"])} dir="ltr">
        {metric.value}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{block.description}</p>
    </div>
  );
}

function BudgetBars({ block, stats, lang }: { block: BoardBlock; stats: HomeStats | undefined; lang: Lang }) {
  const c = COPY[lang].labels;
  const budget = stats?.budget;
  const revenue = budget?.totalRevenue ?? 0;
  const spending = budget?.totalExpenditure ?? 0;
  const deficit = Math.abs(budget?.deficit ?? 0);
  const max = Math.max(revenue, spending, deficit, 1);
  const rows = [
    { label: c.revenue, value: revenue, color: "bg-chart-3" },
    { label: c.spending, value: spending, color: "bg-chart-4" },
    { label: c.deficit, value: deficit, color: "bg-destructive" },
  ];

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{block.title || c.budget}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{block.description}</p>
        </div>
        <EvidenceLinks source={budget} appHref="/budget" lang={lang} />
      </div>
      <div className="space-y-5">
        {rows.map((row, index) => {
          const relativePct = Math.max(5, (row.value / max) * 100);
          const valueLabel = budget ? moneyBillions(row.value) : "...";
          const detail = lang === "ar"
            ? `${relativePct.toFixed(1)}% من أكبر بند ظاهر`
            : `${relativePct.toFixed(1)}% of the largest visible line`;

          return (
            <div key={row.label} style={{ animationDelay: `${index * 80}ms` }} className="animate-fade-up">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="font-mono text-sm font-bold" dir="ltr">{valueLabel}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    role="img"
                    aria-label={chartHoverLabel(row.label, valueLabel, detail, lang)}
                    className="h-3 cursor-help overflow-hidden rounded-[4px] bg-muted outline-none ring-primary/0 transition-shadow hover:ring-2 focus-visible:ring-2"
                  >
                    <div
                      className={cn("h-full w-full rounded-[4px] transition-transform duration-700", row.color)}
                      style={{
                        transform: `scaleX(${relativePct / 100})`,
                        transformOrigin: lang === "ar" ? "right center" : "left center",
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-60 leading-5">
                  <span className="font-semibold">{row.label}</span>
                  <span className="ms-2 font-mono" dir="ltr">{valueLabel}</span>
                  <span className="block text-muted">{detail}</span>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DebtSplit({ block, stats, lang }: { block: BoardBlock; stats: HomeStats | undefined; lang: Lang }) {
  const c = COPY[lang].labels;
  const external = stats?.externalDebt?.value ?? 0;
  const domestic = stats?.domesticDebt?.value ?? 0;
  const total = Math.max(external + domestic, 1);
  const externalPct = (external / total) * 100;
  const domesticPct = (domestic / total) * 100;

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{block.title || c.debt}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{block.description}</p>
        </div>
        <EvidenceLinks source={stats?.totalDebt} appHref="/debt" lang={lang} />
      </div>
      <div className="h-5 overflow-hidden rounded-[4px] bg-muted">
        <div className="flex h-full">
          {[
            {
              label: c.external,
              value: stats?.externalDebt ? fmtUSD(external, { compact: true, decimals: 1 }) : "...",
              pct: externalPct,
              color: "bg-chart-2",
            },
            {
              label: c.domestic,
              value: stats?.domesticDebt ? fmtEGP(domestic, { compact: true, decimals: 1 }) : "...",
              pct: domesticPct,
              color: "bg-chart-5",
            },
          ].map((segment) => {
            const detail = lang === "ar"
              ? `${segment.pct.toFixed(1)}% من الشريط`
              : `${segment.pct.toFixed(1)}% of the bar`;

            return (
              <Tooltip key={segment.label}>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    role="img"
                    aria-label={chartHoverLabel(segment.label, segment.value, detail, lang)}
                    className={cn("h-full cursor-help outline-none transition-[filter] hover:brightness-125 focus-visible:brightness-125", segment.color)}
                    style={{ width: `${segment.pct}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56 leading-5">
                  <span className="font-semibold">{segment.label}</span>
                  <span className="ms-2 font-mono" dir="ltr">{segment.value}</span>
                  <span className="block text-muted">{detail}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[6px] border border-border/60 bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">{c.external}</p>
          <p className="mt-2 font-mono font-bold" dir="ltr">{stats?.externalDebt ? fmtUSD(external, { compact: true, decimals: 1 }) : "..."}</p>
        </div>
        <div className="rounded-[6px] border border-border/60 bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">{c.domestic}</p>
          <p className="mt-2 font-mono font-bold" dir="ltr">{stats?.domesticDebt ? fmtEGP(domestic, { compact: true, decimals: 1 }) : "..."}</p>
        </div>
      </div>
    </div>
  );
}

function InvestmentLens({ block, stats, lang }: { block: BoardBlock; stats: HomeStats | undefined; lang: Lang }) {
  const budget = stats?.budget;
  const debtToGdp = stats?.totalDebt?.debtToGdpRatio;
  const rows = lang === "ar"
    ? [
        {
          label: "مخاطر العملة",
          value: stats?.externalDebt ? fmtUSD(stats.externalDebt.value, { compact: true, decimals: 1 }) : "...",
          note: "راقب الالتزامات الخارجية قبل قرار بالدولار أو أصل مرتبط به.",
        },
        {
          label: "ضغط الموازنة",
          value: budget ? moneyBillions(Math.abs(budget.deficit)) : "...",
          note: "العجز يوضح احتياج التمويل وقد يؤثر على الفائدة والسيولة.",
        },
        {
          label: "حجم الدين",
          value: debtToGdp != null ? `${debtToGdp.toFixed(1)}%` : "...",
          note: "النسبة تعطي قراءة للمخاطر الكلية، لا توصية شراء أو بيع.",
        },
      ]
    : [
        {
          label: "Currency risk",
          value: stats?.externalDebt ? fmtUSD(stats.externalDebt.value, { compact: true, decimals: 1 }) : "...",
          note: "Check external obligations before a USD-linked or FX-heavy choice.",
        },
        {
          label: "Fiscal pressure",
          value: budget ? moneyBillions(Math.abs(budget.deficit)) : "...",
          note: "The deficit frames financing pressure, rates, and liquidity.",
        },
        {
          label: "Debt load",
          value: debtToGdp != null ? `${debtToGdp.toFixed(1)}%` : "...",
          note: "Use this as macro risk context, not a buy or sell signal.",
        },
      ];

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{block.title || (lang === "ar" ? "عدسة القرار" : "Decision lens")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {block.description || (lang === "ar"
              ? "ميزان لا يعطي توصية استثمار. هو يحول السؤال إلى عوامل تقارنها حسب هدفك وأفقك الزمني."
              : "Mizan is not giving investment advice. It turns the question into factors you can compare against your goal and time horizon.")}
          </p>
        </div>
        <EvidenceLinks source={stats?.totalDebt ?? stats?.budget} appHref="/debt" lang={lang} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {rows.map((row, index) => (
          <div key={row.label} className="rounded-[6px] border border-border/60 bg-background/70 p-3 animate-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
            <p className="text-xs font-semibold text-muted-foreground">{row.label}</p>
            <p className="mt-3 font-mono text-xl font-black text-foreground" dir="ltr">{row.value}</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{row.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolLauncher({ block, lang }: { block: BoardBlock; lang: Lang }) {
  const baseTools = lang === "ar"
    ? [
        { href: "/tools/invest", label: "محاكي الاستثمار", note: "قارن الذهب والدولار والعقار والبورصة.", icon: Calculator },
        { href: "/tools/buy-vs-rent", label: "شراء أم إيجار", note: "حوّل قرار السكن إلى أرقام.", icon: Building2 },
        { href: "/debt", label: "الدين", note: "افهم ضغط الدين قبل المخاطرة.", icon: Scale },
      ]
    : [
        { href: "/tools/invest", label: "Investment simulator", note: "Compare gold, USD, property, and equities.", icon: Calculator },
        { href: "/tools/buy-vs-rent", label: "Buy vs rent", note: "Turn the housing decision into numbers.", icon: Building2 },
        { href: "/debt", label: "Debt board", note: "Read debt pressure before taking risk.", icon: Scale },
      ];
  const tools = block.action
    ? [
        {
          href: block.action.href,
          label: block.action.label,
          note: block.description,
          icon: Calculator,
        },
        ...baseTools.filter((tool) => tool.href !== block.action?.href),
      ].slice(0, 3)
    : baseTools;

  return (
    <div className="grid gap-3">
      {tools.map((tool, index) => {
        const Icon = tool.icon;
        return (
          <Link
            key={tool.href}
            href={tool.href}
            className="group workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 no-underline transition-colors hover:border-primary animate-fade-up"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                <Icon size={15} className="text-primary" />
                {tool.label}
              </span>
              <ArrowUpRight size={14} className="text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{tool.note}</p>
          </Link>
        );
      })}
    </div>
  );
}

function formatIndicatorValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit.toLowerCase() === "egp/usd") return `${value.toFixed(1)} EGP/USD`;
  if (unit.toUpperCase() === "EGP") return fmtEGP(value, { compact: true, decimals: 1 });
  if (unit.toUpperCase() === "USD") return fmtUSD(value, { compact: true, decimals: 1 });
  return `${value.toLocaleString()} ${unit}`;
}

function indicatorLabel(key: InvestmentIndicatorKey, lang: Lang): string {
  const labels: Record<InvestmentIndicatorKey, { en: string; ar: string }> = {
    egx30_annual_return: { en: "EGX30 return", ar: "عائد EGX30" },
    egypt_real_estate_return: { en: "Real estate", ar: "العقار" },
    gold_annual_return: { en: "Gold", ar: "الذهب" },
    cbe_cd_rate: { en: "Bank CDs", ar: "شهادات البنوك" },
    egypt_tbill_rate: { en: "T-bills", ar: "أذون الخزانة" },
    inflation: { en: "Inflation", ar: "التضخم" },
    exchange_rate: { en: "Exchange rate", ar: "سعر الصرف" },
    egypt_mortgage_rate: { en: "Mortgage rate", ar: "تمويل عقاري" },
  };
  return labels[key][lang];
}

function IndicatorStrip({
  block,
  lang,
  investmentDefaults,
}: {
  block: BoardBlock;
  lang: Lang;
  investmentDefaults: InvestmentDefaults | undefined;
}) {
  const keys = block.indicators.length > 0
    ? block.indicators
    : (["cbe_cd_rate", "egypt_tbill_rate", "inflation", "exchange_rate"] satisfies InvestmentIndicatorKey[]);

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <div className="mb-5">
        <p className="text-sm font-bold">{block.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{block.description}</p>
      </div>
      <div className={cn("grid gap-3 sm:grid-cols-2", block.span >= 12 && "xl:grid-cols-4")}>
        {keys.map((key, index) => {
          const record = investmentDefaults?.[key];
          const badgeSource = record?.sourceUrl
            ? { sourceUrl: record.sourceUrl, sanadLevel: record.sanadLevel }
            : null;
          return (
            <div key={key} className="rounded-[6px] border border-border/60 bg-background/70 p-3 animate-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground">{indicatorLabel(key, lang)}</p>
                <EvidenceLinks source={badgeSource} appHref="/economy" lang={lang} />
              </div>
              <p className="mt-4 font-mono text-xl font-black text-foreground" dir="ltr">
                {record ? formatIndicatorValue(record.value, record.unit) : "..."}
              </p>
              {record?.date && (
                <p className="mt-2 text-[0.65rem] text-muted-foreground">{record.date}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntityGrid({ stats, lang }: { stats: HomeStats | undefined; lang: Lang }) {
  const c = COPY[lang].labels;
  const rows = [
    { label: c.government, value: `${stats?.ministries.value.toLocaleString() ?? "..."} ${c.ministries}`, icon: Building2, source: stats?.ministries, href: "/government" },
    { label: c.parliament, value: `${stats?.parliamentarians.value.toLocaleString() ?? "..."} ${c.members}`, icon: Users, source: stats?.parliamentarians, href: "/parliament" },
    { label: c.governorates, value: `${stats?.governorates.value.toLocaleString() ?? "..."} ${c.regions}`, icon: Landmark, source: stats?.governorates, href: "/governorate" },
    { label: c.constitution, value: `${stats?.constitutionArticles.value.toLocaleString() ?? "..."} ${c.articles}`, icon: Scale, source: stats?.constitutionArticles, href: "/constitution" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div key={row.label} className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Icon size={15} />
                {row.label}
              </span>
              <EvidenceLinks source={row.source} appHref={row.href} lang={lang} />
            </div>
            <p className="mt-4 font-mono text-lg font-bold" dir="ltr">{row.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function SourceList({ stats, lang }: { stats: HomeStats | undefined; lang: Lang }) {
  const rawSources: Array<StatSource | null | undefined> = [
    stats?.budget,
    stats?.totalDebt,
    stats?.ministries,
    stats?.parliamentarians,
    stats?.constitutionArticles,
  ];
  const sources = rawSources.filter((source): source is StatSource => source != null);

  return (
    <div className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up">
      <p className="mb-4 text-sm font-bold">{COPY[lang].source}</p>
      <div className="grid gap-2">
        {sources.map((source, index) => (
          <div key={`${source.sourceUrl}-${index}`} className="flex items-center justify-between gap-3 rounded-[6px] border border-border/50 bg-background/70 px-3 py-2">
            <span className="truncate text-xs text-muted-foreground">{source.sourceUrl}</span>
            <EvidenceLinks source={source} appHref="/transparency" lang={lang} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingSteps({ block, board, stats }: { block: BoardBlock; board: Board; stats: HomeStats | undefined }) {
  const lang = board.lang;
  const c = COPY[lang].labels;
  const steps = (() => {
    if (board.plan.length > 0) {
      return board.plan.map((item, index) => ({
        label: index === 0 ? block.title : `${index + 1}`,
        value: `${index + 1}`,
        note: item,
      }));
    }
    if (board.intent === "investment") {
      return lang === "ar"
        ? [
            { label: "حدد الهدف", value: "1", note: "سيولة قصيرة، حماية من التضخم، أو أصل طويل الأجل؟ الإجابة تغير الواجهة المناسبة." },
            { label: "قارن الفرضيات", value: "2", note: "استخدم المحاكي لمقارنة نفس المبلغ عبر أكثر من أصل بدل نصيحة عامة." },
          ]
        : [
            { label: "Define the goal", value: "1", note: "Short-term liquidity, inflation hedge, or long-term asset? The answer changes the right view." },
            { label: "Compare assumptions", value: "2", note: "Use the simulator to compare the same amount across assets instead of taking generic advice." },
          ];
    }
    if (board.intent === "debt") {
      return [
        { label: c.debtToGdp, value: stats?.totalDebt?.debtToGdpRatio != null ? `${stats.totalDebt.debtToGdpRatio.toFixed(1)}%` : "...", note: lang === "ar" ? "النسبة تضع الدين في سياق حجم الاقتصاد." : "Ratio puts debt in economic context." },
        { label: c.external, value: stats?.externalDebt ? fmtUSD(stats.externalDebt.value, { compact: true, decimals: 1 }) : "...", note: lang === "ar" ? "الدين الخارجي يضغط على العملة والاحتياطي." : "External debt pressures FX and reserves." },
      ];
    }
    if (board.intent === "budget") {
      return [
        { label: c.deficit, value: stats?.budget ? moneyBillions(Math.abs(stats.budget.deficit)) : "...", note: lang === "ar" ? "الفجوة بين الإيرادات والمصروفات هي نقطة البداية." : "The revenue-spending gap is the first signal." },
        { label: c.spending, value: stats?.budget ? moneyBillions(stats.budget.totalExpenditure) : "...", note: lang === "ar" ? "حجم المصروفات يحدد ضغط التمويل." : "Spending size defines funding pressure." },
      ];
    }
    return [
      { label: c.government, value: `${stats?.ministries.value.toLocaleString() ?? "..."}`, note: lang === "ar" ? "الوزارات هي مدخل قراءة الدولة." : "Ministries anchor the state map." },
      { label: c.parliament, value: `${stats?.parliamentarians.value.toLocaleString() ?? "..."}`, note: lang === "ar" ? "البرلمان يوضح طبقة التمثيل والرقابة." : "Parliament shows representation and oversight." },
    ];
  })();

  return (
    <div className="grid gap-3">
      {steps.map((step, index) => (
        <div key={step.label} className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4 animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-primary">{step.label}</p>
            <p className="font-mono text-sm font-bold" dir="ltr">{step.value}</p>
          </div>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">{step.note}</p>
        </div>
      ))}
    </div>
  );
}

function BoardBlockView({
  block,
  board,
  stats,
  investmentDefaults,
  anchorRef,
  animate = true,
}: {
  block: BoardBlock;
  board: Board;
  stats: HomeStats | undefined;
  investmentDefaults: InvestmentDefaults | undefined;
  anchorRef?: (node: HTMLDivElement | null) => void;
  animate?: boolean;
}) {
  const spanClass: Record<BoardBlock["span"], string> = {
    3: "lg:col-span-3",
    4: "lg:col-span-4",
    5: "lg:col-span-5",
    6: "lg:col-span-6",
    7: "lg:col-span-7",
    8: "lg:col-span-8",
    12: "lg:col-span-12",
  };

  return (
    <div ref={anchorRef} className={cn("col-span-12 scroll-mt-24", animate && "animate-ui-block", spanClass[block.span])}>
      {block.kind === "kpi" && <MetricCard block={block} stats={stats} lang={board.lang} />}
      {block.kind === "budgetBars" && <BudgetBars block={block} stats={stats} lang={board.lang} />}
      {block.kind === "debtSplit" && <DebtSplit block={block} stats={stats} lang={board.lang} />}
      {block.kind === "entityGrid" && <EntityGrid stats={stats} lang={board.lang} />}
      {block.kind === "sourceList" && <SourceList stats={stats} lang={board.lang} />}
      {block.kind === "findingSteps" && <FindingSteps block={block} board={board} stats={stats} />}
      {block.kind === "investmentLens" && <InvestmentLens block={block} stats={stats} lang={board.lang} />}
      {block.kind === "toolLauncher" && <ToolLauncher block={block} lang={board.lang} />}
      {block.kind === "indicatorStrip" && <IndicatorStrip block={block} lang={board.lang} investmentDefaults={investmentDefaults} />}
    </div>
  );
}

function BoardCanvas({
  board,
  stats,
  investmentDefaults,
  visibleBlockCount,
  disabled,
  onSuggestion,
  onToggleLanguage,
  registerBlock,
}: {
  board: Board;
  stats: HomeStats | undefined;
  investmentDefaults: InvestmentDefaults | undefined;
  visibleBlockCount: number;
  disabled: boolean;
  onSuggestion: (prompt: string) => void;
  onToggleLanguage: () => void;
  registerBlock: (id: string, node: HTMLDivElement | null) => void;
}) {
  const languageLabel = board.lang === "ar" ? "En" : "ع";
  const spec = useMemo(() => boardToJsonSpec(board, visibleBlockCount), [board, visibleBlockCount]);
  const { registry } = useMemo(() => defineRegistry(mizanJsonCatalog, {
    components: {
      BoardRoot: ({ children }) => (
        <section className="workbench-panel relative overflow-hidden rounded-[8px] bg-card/90 p-4 animate-fade-up md:p-5">
          <div className="relative">{children}</div>
        </section>
      ),
      BoardHeader: () => (
        <div className="border-b border-border/80 pb-4">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="workbench-label rounded-[6px] border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
                {board.lang === "ar" ? "عرض بيانات" : "Data view"}
              </span>
              <button
                type="button"
                onClick={onToggleLanguage}
                disabled={disabled}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-[6px] border border-border bg-background/80 px-3 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                aria-label={board.lang === "ar" ? "Switch to English" : "Switch to Arabic"}
              >
                {languageLabel}
              </button>
            </div>
            <div>
              <h2 className="max-w-5xl text-2xl font-black leading-tight md:text-3xl">{board.title}</h2>
              <p className="mt-3 min-h-5 max-w-4xl text-sm leading-6 text-muted-foreground">
                {board.answer}
              </p>
            </div>
          </div>
        </div>
      ),
      BoardGrid: ({ children }) => (
        <div className="space-y-4 py-5">
          {visibleBlockCount > 0 && (
            <div className="grid grid-cols-12 gap-3">
              {children}
            </div>
          )}
        </div>
      ),
      BoardBlock: ({ props }) => {
        const block = board.blocks.find((item) => item.id === props.blockId);
        if (!block) return null;

        return (
          <BoardBlockView
            block={block}
            board={board}
            stats={stats}
            investmentDefaults={investmentDefaults}
            anchorRef={(node) => registerBlock(block.id, node)}
          />
        );
      },
      BoardSuggestions: () => (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {board.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              disabled={disabled}
              className="rounded-[6px] border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ),
    },
  }), [board, disabled, investmentDefaults, languageLabel, onSuggestion, onToggleLanguage, registerBlock, stats, visibleBlockCount]);

  return (
    <StateProvider initialState={spec.state}>
      <ActionProvider handlers={{}}>
        <VisibilityProvider>
          <Renderer spec={spec} registry={registry} />
        </VisibilityProvider>
      </ActionProvider>
    </StateProvider>
  );
}

function ChatRail({
  turns,
  input,
  lang,
  disabled,
  activeTurnId,
  onInput,
  onSubmit,
  onReset,
  onSelectTurn,
}: {
  turns: Turn[];
  input: string;
  lang: Lang;
  disabled: boolean;
  activeTurnId: string | null;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onSelectTurn: (turnId: string) => void;
}) {
  const copy = COPY[lang];
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [turns.length, activeTurnId]);

  return (
    <aside className="workbench-panel rounded-[8px] bg-card/90 p-3 animate-chat-rail lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-[6px] border border-border/70 bg-background/75 px-3 py-2">
          <div>
            <p className="workbench-label text-primary">Mizan</p>
            <p className="text-xs text-muted-foreground">{lang === "ar" ? "محادثة حية" : "Live chat"}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw size={12} />
            {copy.reset}
          </button>
        </div>

        <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[8px] border border-border/70 bg-background/70 p-3">
          {turns.map((turn) => {
            const isActiveTurn = turn.id === activeTurnId;
            const status = turnStatusLabel(turn, lang);
            const blockCount = turn.board?.blocks.length ?? 0;

            return (
              <div key={turn.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => onSelectTurn(turn.id)}
                  className="ms-auto block max-w-[90%] rounded-[8px] border border-border bg-primary/15 px-3 py-2 text-start text-xs leading-5 text-foreground transition-colors hover:border-primary"
                >
                  {turn.prompt}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTurn(turn.id)}
                  className="block w-full rounded-[8px] border border-border/70 bg-card px-3 py-2 text-start transition-colors hover:border-primary data-[active=true]:border-primary data-[active=true]:bg-primary/10"
                  data-active={isActiveTurn}
                >
                  <span className="workbench-label inline-flex items-center gap-2 text-primary">
                    <span className="size-2 rounded-full bg-primary" />
                    {status}
                  </span>
                  <p className="mt-2 text-sm font-semibold leading-5">
                    {turn.status === "planning"
                      ? (lang === "ar" ? "أجهز اللوحة..." : "Composing the view...")
                      : turn.board?.chatReply ?? turn.error ?? (lang === "ar" ? "لم تكتمل الخطة" : "No plan returned")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-muted-foreground">
                    <span className="line-clamp-1">{turn.board?.title ?? (lang === "ar" ? "في الانتظار" : "Pending plan")}</span>
                    <span>{blockCountLabel(blockCount, lang)}</span>
                  </div>
                </button>
              </div>
            );
          })}
          {turns.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-border/70 bg-card/70 p-4 text-xs leading-5 text-muted-foreground">
              {copy.empty}
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex items-center gap-2 rounded-[8px] border border-border bg-background/80 p-2"
        >
          <MessageSquareText size={16} className="ms-2 text-muted-foreground" />
          <input
            value={input}
            onChange={(event) => onInput(event.target.value)}
            placeholder={copy.placeholder}
            disabled={disabled}
            className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <button type="submit" className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-primary bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40" disabled={disabled || !input.trim()}>
            <ArrowUp size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}

function PlanningCanvas({ turn, lang }: { turn: Turn; lang: Lang }) {
  const steps = lang === "ar"
    ? ["أقرأ السؤال", "أطلب خطة الواجهة من النموذج", "أطابق الخطة مع مكونات ميزان", "أجهز الرسم"]
    : ["Reading the question", "Asking the model for a UI plan", "Matching the plan to Mizan blocks", "Preparing the render"];

  return (
    <section className="workbench-panel rounded-[8px] bg-card/90 p-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <p className="workbench-label text-primary">{lang === "ar" ? "تخطيط حي" : "Live planning"}</p>
          <h2 className="mt-2 text-2xl font-black md:text-4xl">{turn.prompt}</h2>
        </div>
        <div className="rounded-[6px] border border-primary bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
          {lang === "ar" ? "LLM" : "LLM"} / {lang === "ar" ? "ينسق اللوحة" : "composing grid"}
        </div>
      </div>
      <div className="grid gap-3 py-5 md:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step} className="workbench-tile rounded-[8px] border border-border/70 bg-background/70 p-4 animate-fade-up" style={{ animationDelay: `${index * 90}ms` }}>
            <div className="mb-4 h-1.5 overflow-hidden rounded-[3px] bg-muted">
              <div className="mizan-progress-bar h-full w-full rounded-[3px] bg-primary animate-pulse" style={{ transform: `scaleX(${(35 + index * 15) / 100})` }} />
            </div>
            <p className="text-sm font-semibold">{step}</p>
          </div>
        ))}
      </div>
      {turn.status === "error" && (
        <div className="rounded-[8px] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {turn.error}
        </div>
      )}
    </section>
  );
}

function PromptBox({
  input,
  lang,
  disabled,
  onInput,
  onSubmit,
}: {
  input: string;
  lang: Lang;
  disabled: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
}) {
  const copy = COPY[lang];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-[8px] border border-border bg-card/90 p-2 shadow-none transition-colors focus-within:border-primary"
    >
      <MessageSquareText size={17} className="ms-2 shrink-0 text-muted-foreground" />
      <input
        value={input}
        onChange={(event) => onInput(event.target.value)}
        placeholder={copy.placeholder}
        disabled={disabled}
        className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
      <button type="submit" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40" disabled={disabled || !input.trim()}>
        <ArrowUp size={17} />
      </button>
    </form>
  );
}

function MizanMotionTitle({ lang }: { lang: Lang }) {
  const terms = lang === "ar"
    ? ["يجمع", "يعرض"]
    : ["collects", "visualizes"];

  return (
    <h1 className="mizan-motion-title" aria-label={lang === "ar" ? "ميزان يجمع ويعرض" : "Mizan collects and visualizes"}>
      <span>{COPY[lang].title}</span>
      <span className="mizan-slot-text" aria-hidden="true">
        {terms.map((term) => (
          <span key={term}>{term}</span>
        ))}
      </span>
    </h1>
  );
}

function StartCanvas({
  input,
  lang,
  stats,
  disabled,
  onInput,
  onSubmit,
  onExample,
}: {
  input: string;
  lang: Lang;
  stats: HomeStats | undefined;
  disabled: boolean;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onExample: (prompt: string) => void;
}) {
  const copy = COPY[lang];
  const c = copy.labels;
  const contextRows = [
    {
      label: c.government,
      value: `${stats?.ministries.value.toLocaleString() ?? "..."} ${c.ministries}`,
      icon: Building2,
      source: stats?.ministries,
      href: "/government",
    },
    {
      label: c.parliament,
      value: `${stats?.parliamentarians.value.toLocaleString() ?? "..."} ${c.members}`,
      icon: Users,
      source: stats?.parliamentarians,
      href: "/parliament",
    },
    {
      label: c.budget,
      value: stats?.budget?.year ?? "...",
      icon: Landmark,
      source: stats?.budget,
      href: "/budget",
    },
  ];

  return (
    <section className="mx-auto grid max-w-6xl gap-4">
      <div className="workbench-panel rounded-[8px] bg-card/90 p-5 md:p-6">
        <div className="min-w-0">
          <span className="mb-4 inline-flex size-11 items-center justify-center rounded-[8px] border border-primary/35 bg-primary/12 text-primary">
            <Scale size={24} strokeWidth={1.7} />
          </span>
          <p className="workbench-label text-primary">{lang === "ar" ? "واجهة محادثة" : "Chat workspace"}</p>
          <MizanMotionTitle lang={lang} />
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{copy.subtitle}</p>
        </div>

        <div className="mt-6">
          <PromptBox input={input} lang={lang} disabled={disabled} onInput={onInput} onSubmit={onSubmit} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {copy.examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onExample(example)}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-[6px] border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <MessageSquareText size={13} />
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {contextRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="workbench-tile rounded-[8px] border border-border/70 bg-card/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Icon size={15} />
                  {row.label}
                </span>
                <EvidenceLinks source={row.source} appHref={row.href} lang={lang} />
              </div>
              <p className="mt-4 font-mono text-lg font-bold" dir="ltr">{row.value}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { lang: appLang } = useLanguage();
  const stats = useQuery(api.government.getHomeStats) as HomeStats | undefined;
  const investmentDefaults = useQuery(api.tools.getInvestmentDefaults) as InvestmentDefaults | undefined;
  const planGrid = useAction(api.uiAgent.planGrid);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [workspaceBoard, setWorkspaceBoard] = useState<Board | null>(null);
  const [visibleBlockCount, setVisibleBlockCount] = useState(0);
  const [renderPhase, setRenderPhase] = useState<RenderPhase>("idle");
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const workspaceBoardRef = useRef<Board | null>(null);
  const interactionLockedRef = useRef(false);
  const revealFromRef = useRef(0);
  const activeTurn = (activeTurnId ? turns.find((turn) => turn.id === activeTurnId) : null) ?? turns.at(-1) ?? null;
  const activeBoard = workspaceBoard;
  const lang = appLang;
  const pageDir = lang === "ar" ? "rtl" : "ltr";
  const copy = COPY[lang];
  const isInteractionLocked = turns.some((turn) => turn.status === "planning")
    || renderPhase === "planning"
    || renderPhase === "rendering";

  useEffect(() => {
    const storedTurns = loadTurns();
    setTurns(storedTurns);
    setActiveTurnId(storedTurns.at(-1)?.id ?? null);
    setWorkspaceBoard(storedTurns.at(-1)?.board ?? null);
  }, []);

  useEffect(() => {
    localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify(turns.slice(-12)));
  }, [turns]);

  useEffect(() => {
    workspaceBoardRef.current = workspaceBoard;
  }, [workspaceBoard]);

  useEffect(() => {
    interactionLockedRef.current = isInteractionLocked;
  }, [isInteractionLocked]);

  useEffect(() => {
    if (!activeBoard) {
      setVisibleBlockCount(0);
      blockRefs.current = {};
      return;
    }

    const startCount = Math.min(revealFromRef.current, activeBoard.blocks.length);
    revealFromRef.current = 0;
    setVisibleBlockCount(startCount);
    if (!workspaceBoardRef.current) {
      setRenderPhase("planning");
    }
    if (startCount === 0) {
      blockRefs.current = {};
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (startCount >= activeBoard.blocks.length) {
      timers.push(setTimeout(() => setRenderPhase("done"), 120));
    } else {
      timers.push(setTimeout(() => setRenderPhase("rendering"), 120));
      activeBoard.blocks.slice(startCount).forEach((_, index) => {
        timers.push(setTimeout(() => setVisibleBlockCount(startCount + index + 1), 180 + index * 260));
      });
      timers.push(setTimeout(() => setRenderPhase("done"), 240 + (activeBoard.blocks.length - startCount) * 260));
    }

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [activeBoard]);

  useEffect(() => {
    if (!activeBoard?.focusBlockId || renderPhase !== "done") return;
    const target = blockRefs.current[activeBoard.focusBlockId];
    const frame = window.requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeBoard?.focusBlockId, renderPhase, visibleBlockCount]);

  const registerBlock = useCallback((id: string, node: HTMLDivElement | null) => {
    blockRefs.current[id] = node;
  }, []);

  const submit = useCallback((raw: string) => {
    if (interactionLockedRef.current) return;
    const prompt = raw.trim();
    if (!prompt) return;
    interactionLockedRef.current = true;
    const promptLang = appLang;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextTurn: Turn = {
      id,
      prompt,
      board: null,
      status: "planning",
      createdAt: Date.now(),
    };
    const history: PlannerHistory[] = turns.slice(-6).flatMap((turn): PlannerHistory[] => {
      const assistant = turn.board
        ? [{ role: "assistant" as const, content: `${turn.board.chatReply} ${turn.board.title}: ${turn.board.answer}` }]
        : [];
      return [
        { role: "user" as const, content: turn.prompt },
        ...assistant,
      ];
    });
    const currentView = viewSnapshot(workspaceBoardRef.current);

    setTurns((existing) => [...existing, nextTurn].slice(-12));
    setActiveTurnId(id);
    setInput("");
    setRenderPhase("planning");

    void planGrid({ prompt, lang: promptLang, history, currentView })
      .then((plan) => {
        const baseBoard = workspaceBoardRef.current;
        const preservedPlan = preservePlanOperation(plan as UiGridPlan, baseBoard, prompt);
        const incomingBoard = boardFromPlan(preservedPlan);
        const board = mergeBoard(baseBoard, incomingBoard);
        const previousBlockCount = baseBoard?.blocks.length ?? 0;
        const hasNewBlocks = Boolean(baseBoard && incomingBoard.operation !== "replace" && board.blocks.length > previousBlockCount);
        revealFromRef.current = hasNewBlocks ? previousBlockCount : board.blocks.length;
        setWorkspaceBoard(board);
        setTurns((existing) => existing.map((turn) => (
          turn.id === id ? { ...turn, board, status: "done", error: undefined } : turn
        )));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error
          ? error.message
          : "The LLM planner failed before returning a grid.";
        interactionLockedRef.current = false;
        setRenderPhase("done");
        setTurns((existing) => existing.map((turn) => (
          turn.id === id
            ? {
                ...turn,
                status: "error",
                error: `LLM planner failed: ${message}`,
              }
            : turn
        )));
      });
  }, [appLang, planGrid, turns]);

  const reset = useCallback(() => {
    setTurns([]);
    setActiveTurnId(null);
    setWorkspaceBoard(null);
    workspaceBoardRef.current = null;
    revealFromRef.current = 0;
    setVisibleBlockCount(0);
    setRenderPhase("idle");
    blockRefs.current = {};
    setInput("");
    localStorage.removeItem(TURN_STORAGE_KEY);
    localStorage.removeItem("mizan-notation-turns-v2");
    localStorage.removeItem("mizan-notation-turns");
    localStorage.removeItem("mizan-ui-thread");
    interactionLockedRef.current = false;
  }, []);

  const toggleActiveLanguage = useCallback(() => {
    if (!activeTurn || !activeBoard || interactionLockedRef.current) return;
    interactionLockedRef.current = true;
    const nextLang: Lang = activeBoard.lang === "ar" ? "en" : "ar";
    const history: PlannerHistory[] = turns.slice(-6).flatMap((turn): PlannerHistory[] => {
      const assistant = turn.board
        ? [{ role: "assistant" as const, content: `${turn.board.chatReply} ${turn.board.title}: ${turn.board.answer}` }]
        : [];
      return [
        { role: "user" as const, content: turn.prompt },
        ...assistant,
      ];
    });
    const currentView = viewSnapshot(activeBoard);
    setTurns((existing) => existing.map((turn) => (
      turn.id === activeTurn.id ? { ...turn, status: "planning" } : turn
    )));
    setRenderPhase("planning");
    void planGrid({ prompt: activeTurn.prompt, lang: nextLang, history, currentView })
      .then((plan) => {
        const incomingBoard = boardFromPlan({ ...(plan as UiGridPlan), operation: "replace" });
        revealFromRef.current = 0;
        setWorkspaceBoard(incomingBoard);
        setTurns((existing) => existing.map((turn) => (
          turn.id === activeTurn.id ? { ...turn, board: incomingBoard, status: "done", error: undefined } : turn
        )));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error
          ? error.message
          : "The LLM planner failed before returning a translated grid.";
        interactionLockedRef.current = false;
        setRenderPhase("done");
        setTurns((existing) => existing.map((turn) => (
          turn.id === activeTurn.id ? { ...turn, status: "error", error: `LLM planner failed: ${message}` } : turn
        )));
      });
  }, [activeBoard, activeTurn, planGrid, turns]);

  const selectTurn = useCallback((turnId: string) => {
    setActiveTurnId(turnId);
    const selected = turns.find((turn) => turn.id === turnId);
    if (selected?.board && !workspaceBoardRef.current) {
      revealFromRef.current = selected.board.blocks.length;
      setWorkspaceBoard(selected.board);
      return;
    }

    const targetId = selected?.board?.focusBlockId;
    if (!targetId) return;
    window.requestAnimationFrame(() => {
      blockRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [turns]);

  return (
    <div className="mizan-workbench page-content min-h-screen" dir={pageDir}>
      <section className="container-page pb-8 pt-8">
        <div className={cn("mx-auto grid max-w-7xl gap-6", activeTurn ? "lg:grid-cols-[340px_minmax(0,1fr)]" : "grid-cols-1")}>
          {activeTurn && (
            <ChatRail
              turns={turns}
              input={input}
              lang={lang}
              disabled={isInteractionLocked}
              activeTurnId={activeTurn.id}
              onInput={setInput}
              onSubmit={() => submit(input)}
              onReset={reset}
              onSelectTurn={selectTurn}
            />
          )}

          <main className="min-w-0">
            {activeTurn && (
              <div className="mb-5 text-start">
                <h1 className="text-3xl font-black leading-tight">{copy.title}</h1>
                <p className="mt-3 text-sm text-muted-foreground">{copy.subtitle}</p>
              </div>
            )}

            {activeTurn && activeBoard ? (
              <BoardCanvas
                board={activeBoard}
                stats={stats}
                investmentDefaults={investmentDefaults}
                visibleBlockCount={visibleBlockCount}
                disabled={isInteractionLocked}
                onSuggestion={submit}
                onToggleLanguage={toggleActiveLanguage}
                registerBlock={registerBlock}
              />
            ) : activeTurn ? (
              <PlanningCanvas turn={activeTurn} lang={lang} />
            ) : (
              <StartCanvas
                input={input}
                lang={lang}
                stats={stats}
                disabled={isInteractionLocked}
                onInput={setInput}
                onSubmit={() => submit(input)}
                onExample={submit}
              />
            )}
          </main>
        </div>
      </section>
      <AiPipelineStatus />
    </div>
  );
}
