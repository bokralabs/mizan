"use client";

import {
  type ActionEvent,
  type OpenUIError,
  Renderer as OpenUiRenderer,
} from "@openuidev/react-lang";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Clock3,
  DatabaseZap,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Search,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { useLanguage } from "@/components/providers";
import { Skeleton } from "@/components/skeleton";
import {
  buildMizanOpenUiToolProvider,
  buildOpenUiDataContext,
  type HomeStats,
  type InvestmentDefaults,
  type Lang,
} from "@/lib/mizan-openui-tools";
import {
  inferOpenUiPromptIntent,
  openUiFallbackProgram,
} from "@/lib/mizan-openui-contract";
import { mizanOpenUiLibrary } from "@/lib/mizan-openui-library";
import { cn } from "@/lib/utils";

type TurnStatus = "running" | "done" | "error";

type Turn = {
  id: string;
  prompt: string;
  text: string | null;
  code: string | null;
  status: TurnStatus;
  createdAt: number;
  provider?: string;
  model?: string;
  error?: string;
};

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type SearchMatch = {
  turn: Turn;
  index: number;
};

type HarnessResponse = {
  text?: string;
  code?: string;
  provider?: string;
  model?: string;
  error?: string;
};

const TURN_STORAGE_KEY = "mizan-openui-turns-v2";
const OLD_STORAGE_KEYS = [
  "mizan-openui-turns-v1",
  "mizan-json-render-turns-v1",
  "mizan-ai-grid-turns-v1",
  "mizan-notation-turns-v2",
  "mizan-notation-turns",
  "mizan-ui-thread",
];

const COPY = {
  en: {
    title: "Mizan",
    generatedTitle: "Generated views",
    generatedHint: "Each answer is appended below from Mizan data tools. Keep scrolling; the conversation stays beside it.",
    placeholder: "Ask about debt, budget, government, sources, or scenarios...",
    reset: "Reset",
    ask: "Ask",
    examples: [
      "Show debt status",
      "Show the budget gap",
      "Can I trust the sources?",
      "Simulate 100,000 EGP over 5 years",
    ],
    emptyTitle: "No generated view yet",
    emptyBody: "Use the conversation rail to ask a question. The answer will appear here as a sourced view.",
    chatEmpty: "Ask about debt, budget, institutions, sources, or an investment scenario.",
    transcript: "Conversation",
    turnLabel: "turns",
    latestLabel: "Latest",
    askHere: "Ask here",
    search: "Search conversation",
    noMatch: "No matches",
    jump: "Jump to latest",
    streamingBelow: "A reply is still updating below.",
    newBelow: "New messages below.",
    building: "Building view",
    ready: "Ready",
    failed: "Render failed",
    dataReady: "Sources ready",
    dataLoading: "Syncing sources",
    linkedData: "Sourced live view",
    accessibilityStatus: "Conversation updated",
    rendererIssue: "Renderer issue",
    promptLabel: "You",
    runningLabel: "Planning",
    generatedAttachment: "Generated view",
    attachmentReady: "View updated from Mizan data",
    attachmentBuilding: "Preparing sourced blocks",
  },
  ar: {
    title: "ميزان",
    generatedTitle: "العروض المولدة",
    generatedHint: "كل رد يضاف بالأسفل من أدوات بيانات ميزان. تابع التمرير وستبقى المحادثة بجانبها.",
    placeholder: "اسأل عن الدين أو الموازنة أو الحكومة أو المصادر أو السيناريوهات...",
    reset: "إعادة",
    ask: "اسأل",
    examples: [
      "اعرض وضع الدين",
      "أظهر فجوة الموازنة",
      "هل المصادر موثوقة؟",
      "حاكي 100,000 جنيه لمدة 5 سنوات",
    ],
    emptyTitle: "لا يوجد عرض بعد",
    emptyBody: "استخدم شريط المحادثة للسؤال. سيظهر الرد هنا كعرض موثق.",
    chatEmpty: "اسأل عن الدين أو الموازنة أو المؤسسات أو المصادر أو سيناريو استثماري.",
    transcript: "المحادثة",
    turnLabel: "دورات",
    latestLabel: "الأحدث",
    askHere: "اسأل هنا",
    search: "ابحث في المحادثة",
    noMatch: "لا توجد نتائج",
    jump: "الأحدث",
    streamingBelow: "الرد ما زال يتحدث بالأسفل.",
    newBelow: "رسائل جديدة بالأسفل.",
    building: "يبني الواجهة",
    ready: "جاهز",
    failed: "تعذر العرض",
    dataReady: "المصادر جاهزة",
    dataLoading: "مزامنة المصادر",
    linkedData: "عرض موثق مباشر",
    accessibilityStatus: "تم تحديث المحادثة",
    rendererIssue: "مشكلة في العرض",
    promptLabel: "أنت",
    runningLabel: "تخطيط",
    generatedAttachment: "عرض مولد",
    attachmentReady: "تم تحديث العرض من بيانات ميزان",
    attachmentBuilding: "تحضير كتل موثقة",
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTurnStatus(value: unknown): value is TurnStatus {
  return value === "running" || value === "done" || value === "error";
}

function sanitizeAssistantText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/openui|query\(\)|deepseek|mizan-openui/i.test(text)) return null;
  return text;
}

function sanitizeStoredCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replaceAll("OpenUI", "Mizan")
    .replaceAll("Generated Mizan view", "Mizan view")
    .replaceAll("Generated from sourced data", "Sourced data view")
    .replaceAll("An Mizan surface reading from Mizan data tools.", "A sourced view from Mizan data.")
    .replaceAll("An OpenUI surface reading from Mizan data tools.", "A sourced view from Mizan data.")
    .replaceAll("عرض ميزان المولد", "عرض ميزان")
    .replaceAll("واجهة Mizan تقرأ من أدوات بيانات ميزان.", "عرض يقرأ من بيانات ميزان الموثقة.")
    .replaceAll("واجهة OpenUI تقرأ من أدوات بيانات ميزان.", "عرض يقرأ من بيانات ميزان الموثقة.");
}

function parseStoredTurn(value: unknown): Turn | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.prompt !== "string") return null;
  if (!isTurnStatus(value.status) || typeof value.createdAt !== "number") return null;
  return {
    id: value.id,
    prompt: value.prompt,
    text: sanitizeAssistantText(value.text),
    code: sanitizeStoredCode(value.code),
    status: value.status,
    createdAt: value.createdAt,
    provider: typeof value.provider === "string" ? value.provider : undefined,
    model: typeof value.model === "string" ? value.model : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function loadStoredTurns(): Turn[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TURN_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseStoredTurn).filter((turn): turn is Turn => turn !== null).slice(-24);
  } catch {
    return [];
  }
}

function makeTurnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function historyFromTurns(turns: Turn[]): ChatHistoryItem[] {
  return turns.slice(-6).flatMap((turn) => {
    const items: ChatHistoryItem[] = [{ role: "user", content: turn.prompt }];
    if (turn.code) {
      items.push({
        role: "assistant",
        content: turn.text ?? "Rendered a sourced Mizan view.",
      });
    }
    return items;
  });
}

function extractActionPrompt(event: ActionEvent): string | null {
  if (event.type === "open_url") return null;
  if (typeof event.humanFriendlyMessage === "string" && event.humanFriendlyMessage.trim()) {
    return event.humanFriendlyMessage.trim();
  }
  const message = event.params.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function isSelectionActive(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.getSelection()?.toString().trim());
}

function generatedViewId(turnId: string): string {
  return `generated-view-${turnId}`;
}

function generatedTurns(turns: Turn[]): Turn[] {
  return turns.filter((turn) => Boolean(turn.code));
}

function latestCode(turns: Turn[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const code = turns[index]?.code;
    if (code) return code;
  }
  return null;
}

function latestCompletedTurn(turns: Turn[]): Turn | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.code) return turn;
  }
  return null;
}

function statusLabel(turn: Turn, labels: { building: string; failed: string; ready: string }): string {
  if (turn.status === "running") return labels.building;
  if (turn.status === "error") return labels.failed;
  return labels.ready;
}

function statusIcon(status: TurnStatus) {
  if (status === "running") return <Loader2 className="animate-spin" size={12} />;
  if (status === "error") return <CircleAlert size={12} />;
  return <CheckCircle2 size={12} />;
}

function sameProgram(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function alreadyOpenTurnText(prompt: string, lang: Lang): string {
  const intent = inferOpenUiPromptIntent(prompt);
  if (lang === "ar") {
    if (intent === "investmentScenario") return "أداة السيناريو مفتوحة بالفعل. غيّر المبلغ أو المدة أو اطلب مقارنة مختلفة.";
    if (intent === "investment") return "مساحة مؤشرات الاستثمار مفتوحة بالفعل. اطلب مؤشرا أو مقارنة محددة.";
    if (intent === "debt") return "عرض الدين مفتوح بالفعل. اطلب مقارنة أو تفصيلا إضافيا.";
    if (intent === "budget") return "عرض الموازنة مفتوح بالفعل. اطلب بندا أو سياقا إضافيا.";
    if (intent === "sources") return "عرض المصادر مفتوح بالفعل. اطلب مصدرًا أو مستوى ثقة محددًا.";
    return "المساحة الحالية تطابق طلبك بالفعل.";
  }

  if (intent === "investmentScenario") return "The scenario tool is already open. Change the amount, horizon, or ask for a different comparison.";
  if (intent === "investment") return "The investment indicators workspace is already open. Ask for a specific indicator or comparison.";
  if (intent === "debt") return "The debt view is already open. Ask for a comparison or a deeper breakdown.";
  if (intent === "budget") return "The budget view is already open. Ask for a line item or added context.";
  if (intent === "sources") return "The source view is already open. Ask for a specific source or confidence level.";
  return "The current workspace already matches your request.";
}

function scrollIntoGeneratedView(element: HTMLElement | null): void {
  if (!element) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    element.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, 80);
}

function assistantTurnText(prompt: string, lang: Lang): string {
  const intent = inferOpenUiPromptIntent(prompt);

  if (lang === "ar") {
    if (intent === "investmentScenario") return "أضفت أداة سيناريو من مؤشرات ميزان المتاحة.";
    if (intent === "investment") return "أضفت مساحة مؤشرات الاستثمار من بيانات ميزان.";
    if (intent === "debt") return "أضفت عرضا موثقا عن الدين.";
    if (intent === "budget") return "أضفت سياق الموازنة والعجز.";
    if (intent === "sources") return "أضفت عرض المصادر ومستوى الثقة.";
    if (intent === "institutions") return "أضفت خريطة للمؤسسات المرتبطة بالسؤال.";
    return "أضفت عرضا موثقا من بيانات ميزان.";
  }

  if (intent === "investmentScenario") return "I added an investment scenario tool from the available Mizan indicators.";
  if (intent === "investment") return "I added an investment indicators view from Mizan data.";
  if (intent === "debt") return "I added a sourced debt view.";
  if (intent === "budget") return "I added budget and deficit context.";
  if (intent === "sources") return "I added the source and confidence view.";
  if (intent === "institutions") return "I added a map of the relevant institutions.";
  return "I added a sourced Mizan view.";
}

function QueryLoader({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex min-h-8 items-center gap-2 rounded-[6px] border border-border/70 bg-background/90 px-2.5 text-[0.68rem] font-semibold text-muted-foreground shadow-sm">
      <Loader2 size={12} className="animate-spin" />
      {c.dataLoading}
    </div>
  );
}

function EmptyCanvas({
  lang,
  onExample,
}: {
  lang: Lang;
  onExample: (prompt: string) => void;
}) {
  const c = COPY[lang];
  return (
    <section className="workbench-panel flex min-h-[28rem] flex-col justify-between overflow-hidden rounded-[8px] p-5 md:p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="workbench-label rounded-[6px] border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
            {c.title}
          </span>
          <span className="workbench-label rounded-[6px] border border-border/70 bg-background/70 px-2.5 py-1 text-muted-foreground">
            {c.linkedData}
          </span>
        </div>
        <h2 className="mizan-text-safe mt-8 max-w-3xl text-2xl font-black leading-tight text-balance md:text-3xl">
          {c.emptyTitle}
        </h2>
        <p className="mizan-text-safe mt-4 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
          {c.emptyBody}
        </p>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {c.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExample(example)}
            className="workbench-tile min-h-16 rounded-[8px] p-4 text-start transition-colors hover:border-primary hover:text-primary"
          >
            <MessageSquareText size={16} />
            <span className="mizan-text-safe mt-2 block text-sm font-bold leading-6">{example}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlanningCanvas({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section className="workbench-panel grid min-h-[34rem] content-start gap-5 overflow-hidden rounded-[8px] p-5 md:p-7">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Loader2 size={16} className="animate-spin text-primary" />
        {c.runningLabel}
      </div>
      <Skeleton className="h-24 rounded-[8px]" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-32 rounded-[8px]" />
        <Skeleton className="h-32 rounded-[8px]" />
        <Skeleton className="h-32 rounded-[8px]" />
      </div>
      <Skeleton className="h-56 rounded-[8px]" />
    </section>
  );
}

function RendererDiagnostics({
  errors,
  lang,
}: {
  errors: OpenUIError[];
  lang: Lang;
}) {
  if (errors.length === 0) return null;
  const c = COPY[lang];
  return (
    <div className="workbench-panel mb-4 rounded-[8px] border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
      <div className="flex items-center gap-2 font-bold">
        <CircleAlert size={14} />
        {c.rendererIssue}
      </div>
      <p className="mt-2 line-clamp-2">{errors[0]?.message}</p>
    </div>
  );
}

function GeneratedCanvas({
  generated,
  pendingTurn,
  errors,
  lang,
  onAction,
  onErrors,
  toolProvider,
}: {
  generated: Turn[];
  pendingTurn: Turn | null;
  errors: OpenUIError[];
  lang: Lang;
  onAction: (event: ActionEvent) => void;
  onErrors: (errors: OpenUIError[]) => void;
  toolProvider: ReturnType<typeof buildMizanOpenUiToolProvider>;
}) {
  if (pendingTurn && generated.length === 0) {
    return <PlanningCanvas lang={lang} />;
  }

  if (generated.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-4">
      <RendererDiagnostics errors={errors} lang={lang} />
      {generated.map((turn) => (
        <section
          key={turn.id}
          id={generatedViewId(turn.id)}
          data-testid="generated-view-item"
          className="min-w-0 scroll-mt-[calc(var(--header-h)+1rem)]"
        >
          <OpenUiRenderer
            response={turn.code ?? ""}
            library={mizanOpenUiLibrary}
            isStreaming={turn.status === "running"}
            onAction={onAction}
            onError={onErrors}
            queryLoader={<QueryLoader lang={lang} />}
            toolProvider={toolProvider}
          />
        </section>
      ))}
      {pendingTurn ? <PlanningCanvas lang={lang} /> : null}
    </div>
  );
}

function DataStatus({
  stats,
  investmentDefaults,
  lang,
}: {
  stats: HomeStats | undefined;
  investmentDefaults: InvestmentDefaults | undefined;
  lang: Lang;
}) {
  const c = COPY[lang];
  const ready = Boolean(stats && investmentDefaults);
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-[6px] border border-border/70 bg-background/70 px-2.5 text-[0.68rem] font-semibold text-muted-foreground">
      {ready ? <DatabaseZap size={12} className="text-primary" /> : <Loader2 size={12} className="animate-spin" />}
      {ready ? c.dataReady : c.dataLoading}
    </span>
  );
}

function TurnMessage({
  index,
  turn,
  lang,
}: {
  index: number;
  turn: Turn;
  lang: Lang;
}) {
  const c = COPY[lang];
  const turnText = turn.text === "Rendered" || turn.text === "Rendered." || turn.text === "تم العرض"
    ? assistantTurnText(turn.prompt, lang)
    : turn.text;
  return (
    <MessageGroup id={turn.id} className="gap-3">
      <Message align="end">
        <MessageContent>
          <MessageHeader className="justify-end gap-2">
            <span>{c.promptLabel}</span>
            <a
              href={`#${turn.id}`}
              className="rounded-[4px] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              #{index + 1}
            </a>
          </MessageHeader>
          <Bubble align="end" variant="default" className="max-w-[88%]">
            <BubbleContent className="rounded-[8px] px-3 py-2">
              {turn.prompt}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>

      <Message align="start">
        <MessageAvatar className="h-8 w-8 rounded-[8px] border border-border bg-card text-primary">
          <Sparkles size={15} />
        </MessageAvatar>
        <MessageContent>
          <MessageHeader className="gap-2">
            <span>{c.title}</span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[0.65rem]",
              turn.status === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border/70 bg-background/70",
            )}>
              {statusIcon(turn.status)}
              {statusLabel(turn, c)}
            </span>
          </MessageHeader>
          <Bubble variant={turn.status === "error" ? "destructive" : "outline"} className="max-w-[92%]">
            <BubbleContent className="rounded-[8px] px-3 py-2">
              {turn.error ?? turnText ?? statusLabel(turn, c)}
            </BubbleContent>
          </Bubble>
          {turn.status !== "error" ? (
            <AttachmentGroup className="mt-2 max-w-[92%] py-0">
              <Attachment state={turn.status === "running" ? "processing" : "done"} size="sm" className="rounded-[8px]">
                <AttachmentMedia className="rounded-[6px] text-primary">
                  {turn.status === "running" ? <Loader2 className="animate-spin" /> : <DatabaseZap />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{c.generatedAttachment}</AttachmentTitle>
                  <AttachmentDescription>
                    {turn.status === "running" ? c.attachmentBuilding : c.attachmentReady}
                  </AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            </AttachmentGroup>
          ) : null}
          <MessageFooter>
            <Clock3 size={12} />
            <time dateTime={new Date(turn.createdAt).toISOString()}>
              {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(turn.createdAt)}
            </time>
          </MessageFooter>
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

function TranscriptVisibilityBridge({
  onLiveEdgeChange,
  onVisibleIdsChange,
}: {
  onLiveEdgeChange: (atLiveEdge: boolean) => void;
  onVisibleIdsChange: (ids: string[]) => void;
}) {
  const scrollable = useMessageScrollerScrollable();
  const visibility = useMessageScrollerVisibility();

  useEffect(() => {
    onLiveEdgeChange(!scrollable.end);
  }, [onLiveEdgeChange, scrollable.end]);

  useEffect(() => {
    onVisibleIdsChange(visibility.visibleMessageIds);
  }, [onVisibleIdsChange, visibility.visibleMessageIds]);

  return null;
}

function SearchJump({
  matches,
  lang,
  query,
}: {
  matches: SearchMatch[];
  lang: Lang;
  query: string;
}) {
  const scroller = useMessageScroller();
  const c = COPY[lang];

  if (!query.trim()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
      <span>{matches.length > 0 ? `${matches.length}` : c.noMatch}</span>
      {matches.slice(0, 4).map(({ turn, index }) => (
        <Button
          key={turn.id}
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => scroller.scrollToMessage(turn.id, { align: "start", behavior: "smooth" })}
        >
          #{index + 1}
        </Button>
      ))}
    </div>
  );
}

function TranscriptRail({
  activeTurnId,
  hasNewOutOfView,
  isSubmitting,
  lang,
  onLiveEdgeChange,
  onPromptChange,
  onPromptSubmit,
  onReaderIntent,
  onSearchChange,
  onVisibleIdsChange,
  prompt,
  searchQuery,
  turns,
}: {
  activeTurnId: string | null;
  hasNewOutOfView: boolean;
  isSubmitting: boolean;
  lang: Lang;
  onLiveEdgeChange: (atLiveEdge: boolean) => void;
  onPromptChange: (value: string) => void;
  onPromptSubmit: (value: string) => void;
  onReaderIntent: () => void;
  onSearchChange: (value: string) => void;
  onVisibleIdsChange: (ids: string[]) => void;
  prompt: string;
  searchQuery: string;
  turns: Turn[];
}) {
  const c = COPY[lang];
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return turns
      .map((turn, index) => ({ turn, index }))
      .filter(({ turn }) => turn.prompt.toLowerCase().includes(query));
  }, [searchQuery, turns]);
  const latestTurn = turns.at(-1) ?? null;
  const streamingOutOfView = Boolean(latestTurn?.status === "running" && hasNewOutOfView);

  return (
    <aside className="workbench-panel animate-chat-rail flex min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-[8px] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:max-h-[calc(100vh-var(--header-h)-2rem)]" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="border-b border-border/80 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="workbench-label text-primary">{c.transcript}</p>
            <p className="mt-1 text-xs text-muted-foreground">{turns.length} {c.turnLabel}</p>
          </div>
          <span className="rounded-[6px] border border-border/70 bg-background/70 px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground">
            {activeTurnId ? c.latestLabel : c.askHere}
          </span>
        </div>
        <label className="mt-3 flex min-h-9 items-center gap-2 rounded-[6px] border border-border/70 bg-background/70 px-2 text-muted-foreground focus-within:border-primary">
          <Search size={14} />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={onReaderIntent}
            placeholder={c.search}
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </label>
      </div>

      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition="last-anchor"
        scrollMargin={18}
        scrollPreviousItemPeek={72}
      >
        <MessageScroller className="min-h-0 flex-1">
          <SearchJump matches={searchMatches} lang={lang} query={searchQuery} />
          <MessageScrollerViewport
            preserveScrollOnPrepend
            onMouseUpCapture={() => {
              if (isSelectionActive()) onReaderIntent();
            }}
            onPointerDownCapture={(event) => {
              const target = event.target;
              if (target instanceof Element && target.closest("a, button, input, textarea, select")) {
                onReaderIntent();
              }
            }}
            onKeyDownCapture={() => onReaderIntent()}
          >
            <MessageScrollerContent className="gap-6 px-3 py-5">
              <TranscriptVisibilityBridge
                onLiveEdgeChange={onLiveEdgeChange}
                onVisibleIdsChange={onVisibleIdsChange}
              />
              {turns.length === 0 ? (
                <Marker className="px-2 py-12 text-center">
                  <MarkerIcon>
                    <MessageSquareText />
                  </MarkerIcon>
                  <MarkerContent className="max-w-full text-sm leading-6">{c.chatEmpty}</MarkerContent>
                </Marker>
              ) : turns.map((turn, index) => (
                <MessageScrollerItem
                  key={turn.id}
                  messageId={turn.id}
                  scrollAnchor
                >
                  <TurnMessage index={index} turn={turn} lang={lang} />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>

          {hasNewOutOfView ? (
            <Marker className="pointer-events-none absolute inset-x-3 bottom-16 z-10 rounded-[6px] border border-primary/40 bg-background/95 px-2 py-2 text-primary shadow-sm">
              <MarkerIcon>
                {streamingOutOfView ? <Loader2 className="animate-spin" /> : <ArrowDown />}
              </MarkerIcon>
              <MarkerContent>{streamingOutOfView ? c.streamingBelow : c.newBelow}</MarkerContent>
            </Marker>
          ) : null}

          <MessageScrollerButton
            direction="end"
            className="bottom-4 h-9 w-auto gap-2 rounded-[6px] px-3"
            onClick={onReaderIntent}
          >
            <ArrowDown size={14} />
            <span>{c.jump}</span>
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>

      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onPromptSubmit(prompt);
        }}
        className="border-t border-border/80 p-3"
        onFocusCapture={onReaderIntent}
      >
        <div className="flex min-w-0 items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1">
            <span className="sr-only">{c.placeholder}</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onPromptSubmit(prompt);
                }
              }}
              placeholder={c.placeholder}
              rows={2}
              className="mizan-text-safe max-h-28 min-h-12 w-full resize-none rounded-[6px] border border-input bg-background/80 px-3 py-2 text-sm leading-6 shadow-none outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-ring/30"
            />
          </label>
          <Button
            type="submit"
            disabled={!prompt.trim() || isSubmitting}
            className="h-12 rounded-[6px] px-3"
            aria-label={c.ask}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}
            <span className="sr-only">{c.ask}</span>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {c.examples.slice(0, 2).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onPromptSubmit(example)}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[6px] border border-border/70 bg-background/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <ArrowUp size={12} />
              <span className="line-clamp-1">{example}</span>
            </button>
          ))}
        </div>
      </form>
    </aside>
  );
}

export default function Home() {
  const { lang, dir } = useLanguage();
  const c = COPY[lang];
  const stats = useQuery(api.government.getHomeStats) as HomeStats | undefined;
  const investmentDefaults = useQuery(api.tools.getInvestmentDefaults) as InvestmentDefaults | undefined;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rendererErrors, setRendererErrors] = useState<OpenUIError[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [hasNewOutOfView, setHasNewOutOfView] = useState(false);
  const [liveMessage, setLiveMessage] = useState(c.accessibilityStatus);
  const activeCode = useMemo(() => latestCode(turns), [turns]);
  const generated = useMemo(() => generatedTurns(turns), [turns]);
  const latestTurn = turns.at(-1) ?? null;
  const pendingTurn = latestTurn?.status === "running" ? latestTurn : null;
  const activeTurn = latestTurn ?? latestCompletedTurn(turns);
  const latestTurnId = turns.at(-1)?.id ?? null;
  const activeCodeRef = useRef<string | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const generatedViewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns(loadStoredTurns());
    for (const key of OLD_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    activeCodeRef.current = activeCode;
  }, [activeCode]);

  useEffect(() => {
    turnsRef.current = turns;
    window.localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify(turns));
  }, [turns]);

  useEffect(() => {
    setLiveMessage(c.accessibilityStatus);
  }, [c.accessibilityStatus, turns.length, activeTurn?.status]);

  useEffect(() => {
    if (atLiveEdge) {
      setHasNewOutOfView(false);
      return;
    }
    if (visibleIds.length === 0) return;
    const latestVisible = latestTurnId ? visibleIds.includes(latestTurnId) : true;
    setHasNewOutOfView(!latestVisible);
  }, [atLiveEdge, latestTurnId, visibleIds]);

  const toolProvider = useMemo(
    () => buildMizanOpenUiToolProvider({ stats, investmentDefaults, lang }),
    [investmentDefaults, lang, stats],
  );

  const updateTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((current) => current.map((turn) => (
      turn.id === id ? { ...turn, ...patch } : turn
    )));
  }, []);

  const submitPrompt = useCallback(async (rawPrompt: string) => {
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt || isSubmitting) return;

    const id = makeTurnId();
    const createdAt = Date.now();
    const runningTurn: Turn = {
      id,
      prompt: cleanPrompt,
      text: c.building,
      code: null,
      status: "running",
      createdAt,
    };

    setPrompt("");
    setSearchQuery("");
    setRendererErrors([]);
    setHasNewOutOfView(false);
    setIsSubmitting(true);
    setTurns((current) => [...current, runningTurn].slice(-24));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/generative-ui/harness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          lang,
          history: historyFromTurns(turnsRef.current),
          currentCode: activeCodeRef.current,
          dataContext: buildOpenUiDataContext(stats, investmentDefaults),
        }),
        signal: controller.signal,
      });

      const body: unknown = await response.json();
      const payload = isRecord(body) ? body as HarnessResponse : {};
      const fallbackCode = openUiFallbackProgram(cleanPrompt, lang);
      const nextCode = typeof payload.code === "string" && payload.code.trim()
        ? payload.code
        : fallbackCode;
      const activeBefore = activeCodeRef.current;
      const unchangedButSatisfied = sameProgram(nextCode, activeBefore) && inferOpenUiPromptIntent(cleanPrompt) !== "generic";

      updateTurn(id, {
        code: unchangedButSatisfied ? null : nextCode,
        text: unchangedButSatisfied ? alreadyOpenTurnText(cleanPrompt, lang) : assistantTurnText(cleanPrompt, lang),
        status: response.ok && !payload.error ? "done" : "error",
        error: typeof payload.error === "string" ? payload.error : undefined,
        provider: typeof payload.provider === "string" ? payload.provider : undefined,
        model: typeof payload.model === "string" ? payload.model : undefined,
      });
      scrollIntoGeneratedView(document.getElementById(generatedViewId(id)) ?? generatedViewRef.current);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      updateTurn(id, {
        code: openUiFallbackProgram(cleanPrompt, lang),
        text: c.failed,
        status: "error",
        error: error instanceof Error ? error.message : c.failed,
        provider: "openui-fallback",
        model: "mizan-openui-harness",
      });
      scrollIntoGeneratedView(document.getElementById(generatedViewId(id)) ?? generatedViewRef.current);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsSubmitting(false);
    }
  }, [c.building, c.failed, investmentDefaults, isSubmitting, lang, stats, updateTurn]);

  const onReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setPrompt("");
    setRendererErrors([]);
    setSearchQuery("");
    setHasNewOutOfView(false);
    setIsSubmitting(false);
    window.localStorage.removeItem(TURN_STORAGE_KEY);
  }, []);

  const handleOpenUiAction = useCallback((event: ActionEvent) => {
    const actionPrompt = extractActionPrompt(event);
    if (!actionPrompt) return;
    void submitPrompt(actionPrompt);
  }, [submitPrompt]);

  const handleReaderIntent = useCallback(() => {
    setAtLiveEdge(false);
  }, []);

  const handleLiveEdgeChange = useCallback((nextAtLiveEdge: boolean) => {
    setAtLiveEdge(nextAtLiveEdge);
    if (nextAtLiveEdge) setHasNewOutOfView(false);
  }, []);

  return (
    <main className="mizan-workbench min-h-screen bg-background text-foreground" dir={dir}>
      <div className="container-page grid min-h-screen items-start gap-4 pt-[calc(var(--header-h)+1rem)] pb-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <TranscriptRail
          activeTurnId={activeTurn?.id ?? null}
          hasNewOutOfView={hasNewOutOfView}
          isSubmitting={isSubmitting}
          lang={lang}
          onLiveEdgeChange={handleLiveEdgeChange}
          onPromptChange={setPrompt}
          onPromptSubmit={submitPrompt}
          onReaderIntent={handleReaderIntent}
          onSearchChange={setSearchQuery}
          onVisibleIdsChange={setVisibleIds}
          prompt={prompt}
          searchQuery={searchQuery}
          turns={turns}
        />

        <section className="grid min-w-0 content-start gap-4">
          <header className="workbench-panel rounded-[8px] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="workbench-label text-primary">{c.generatedTitle}</p>
                <p className="mizan-text-safe mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {c.generatedHint}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DataStatus stats={stats} investmentDefaults={investmentDefaults} lang={lang} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReset}
                  disabled={turns.length === 0 && !prompt}
                >
                  <RotateCcw size={14} />
                  {c.reset}
                </Button>
              </div>
            </div>
          </header>

          <div
            ref={generatedViewRef}
            data-testid="generated-view"
            className="min-w-0 scroll-mt-[calc(var(--header-h)+1rem)]"
          >
            {generated.length > 0 || pendingTurn ? (
              <GeneratedCanvas
                generated={generated}
                pendingTurn={pendingTurn}
                errors={rendererErrors}
                lang={lang}
                onAction={handleOpenUiAction}
                onErrors={setRendererErrors}
                toolProvider={toolProvider}
              />
            ) : (
              <EmptyCanvas lang={lang} onExample={submitPrompt} />
            )}
          </div>
        </section>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
    </main>
  );
}
