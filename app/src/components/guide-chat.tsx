"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useLanguage } from "@/components/providers";
import { GUIDE_PRESETS, PAGE_TOURS, type LocalTourStep } from "@/lib/guide-workflows";
import {
  savePendingAction,
  saveThreadId,
  getThreadId,
  clearThreadId,
  executeGuideTool,
  hasGuideTool,
} from "@/lib/guide-registry";
import { Compass, X, Send, ArrowRight, Sparkles, Eye, Sliders, Loader2, Check } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type GuideAction =
  | { action: "navigate"; href: string; reason: string }
  | { action: "highlight"; selector: string; title: string; description: string }
  | { action: "control"; tool: string; inputs: Record<string, unknown>; href: string }
  | { action: "ask"; question: string };

type GuideMessage = {
  _id: string;
  role: "user" | "assistant";
  text: string;
  actions?: GuideAction[];
};

// ─── Driver.js helper ───────────────────────────────────────────────────────

async function triggerHighlight(selector: string, title: string, description: string) {
  const { driver } = await import("driver.js");
  // @ts-expect-error CSS import handled by webpack
  await import("driver.js/dist/driver.css");
  const origScroll = window.scrollTo;
  const d = driver({
    popoverClass: "mizan-tour",
    showButtons: [],
    allowClose: true,
    overlayOpacity: 0.5,
    overlayColor: "#000",
    stagePadding: 10,
    stageRadius: 12,
    animate: false,
    smoothScroll: false,
    onHighlightStarted: () => { window.scrollTo = (() => {}) as typeof window.scrollTo; },
    onHighlighted: () => { setTimeout(() => { window.scrollTo = origScroll; }, 100); },
  });
  d.highlight({ element: selector, popover: { title, description, side: "top", align: "center" } });
  return d;
}

// ─── Responsive hook ────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

// ─── Action Cards ───────────────────────────────────────────────────────────

function NavigateCard({ href, reason, isAr: _isAr, onGo }: {
  href: string; reason: string; isAr: boolean; onGo: () => void;
}) {
  const { t } = useLanguage();
  const [done, setDone] = useState(false);
  const pageName = href.replace(/^\/tools\//, "").replace(/^\//, "").replace(/-/g, " ");
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs">{reason}</p>
      {done ? (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-semibold">
          <Check size={12} /> {t.guide_navigated}
        </div>
      ) : (
        <button onClick={() => { setDone(true); onGo(); }}
          className="flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <ArrowRight size={10} />
          {`${t.guide_goTo} ${pageName}`}
        </button>
      )}
    </div>
  );
}

function HighlightCard({ selector, title, description, _isAr, isMobile, onMinimize }: {
  selector: string; title: string; description: string; _isAr?: boolean; isMobile: boolean; onMinimize: () => void;
}) {
  const { t } = useLanguage();
  const driverRef = useRef<{ destroy: () => void } | null>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const timer = setTimeout(async () => {
      if (!document.querySelector(selector)) return;
      if (isMobile) onMinimize(); // Collapse sheet so user sees the highlight
      driverRef.current = await triggerHighlight(selector, title, description);
    }, 300);
    return () => { clearTimeout(timer); driverRef.current?.destroy(); };
  }, [selector, title, description, isMobile, onMinimize]);
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Eye size={10} className="text-amber-500" />
        <span className="text-[10px] font-semibold text-amber-500">{title}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <button onClick={async () => {
        driverRef.current?.destroy();
        if (document.querySelector(selector)) driverRef.current = await triggerHighlight(selector, title, description);
      }} className="text-[9px] text-amber-500 hover:underline mt-1">
        {t.guide_showAgain}
      </button>
    </div>
  );
}

function ControlCard({ tool, inputs, href, currentPage }: {
  tool: string; inputs: Record<string, unknown>; href: string; currentPage: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const summary = Object.entries(inputs).map(([k, v]) => {
    const val = typeof v === "number" ? v.toLocaleString() : String(v);
    return `${k}: ${val}`;
  }).join(", ");
  const onSamePage = currentPage === href;
  const handleApply = () => {
    setDone(true);
    if (onSamePage && hasGuideTool(tool)) {
      executeGuideTool(tool, inputs);
    } else {
      savePendingAction({ tool, inputs, highlight: null, hint: null });
      router.push(href);
    }
  };
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5"><Sliders size={10} className="text-blue-500" /><span className="text-[10px] font-semibold text-blue-500">{t.guide_setValues}</span></div>
      {summary && <p className="text-[10px] text-muted-foreground font-mono">{summary}</p>}
      {done ? (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-semibold"><Check size={12} /> {t.guide_applied}</div>
      ) : (
        <button onClick={handleApply} className="text-[10px] font-semibold px-3 py-1.5 rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors">
          {onSamePage ? t.guide_apply : t.guide_applyAndNavigate}
        </button>
      )}
    </div>
  );
}

function AskCard({ question }: { question: string }) {
  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
      <div className="flex items-center gap-1.5 mb-1"><Sparkles size={10} className="text-purple-500" /></div>
      <p className="text-xs">{question}</p>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg, isAr, currentPage, isMobile, onMinimize }: {
  msg: GuideMessage; isAr: boolean; currentPage: string; isMobile: boolean; onMinimize: () => void;
}) {
  const router = useRouter();
  const isUser = msg.role === "user";
  const actions = isUser ? [] : msg.actions ?? [];
  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
      {msg.text && (
        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted/60 text-foreground rounded-bl-sm"
        }`}>
          <p className="whitespace-pre-wrap">{msg.text}</p>
        </div>
      )}
      {actions.map((a, i) => (
        <div key={i} className="w-full max-w-[90%]">
          {a.action === "navigate" && <NavigateCard href={a.href} reason={a.reason} isAr={isAr} onGo={() => router.push(a.href)} />}
          {a.action === "highlight" && <HighlightCard selector={a.selector} title={a.title} description={a.description} isMobile={isMobile} onMinimize={onMinimize} />}
          {a.action === "control" && <ControlCard tool={a.tool} inputs={a.inputs} href={a.href} currentPage={currentPage} />}
          {a.action === "ask" && <AskCard question={a.question} />}
        </div>
      ))}
    </div>
  );
}

// ─── Chat Content (shared between desktop and mobile) ───────────────────────

function GuideChatContent({
  isAr, pathname, threadId, messages, isWaiting, isCreating, isOverBudget,
  localTourSteps, localTourIndex, isMobile,
  onSend, onReset, onLocalTour, onLocalNext, onMinimize,
}: {
  isAr: boolean;
  pathname: string;
  threadId: string | null;
  messages: GuideMessage[] | undefined;
  isWaiting: boolean;
  isCreating: boolean;
  isOverBudget: boolean;
  localTourSteps: LocalTourStep[] | null;
  localTourIndex: number;
  isMobile: boolean;
  onSend: (text?: string) => void;
  onReset: () => void;
  onLocalTour: () => void;
  onLocalNext: () => void;
  onMinimize: () => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, dir } = useLanguage();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages?.length]);
  useEffect(() => { if (!threadId) setTimeout(() => inputRef.current?.focus(), 200); }, [threadId]);

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    onSend(msg);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-primary" />
          <span className="text-sm font-semibold">{t.guide_title}</span>
        </div>
        {threadId && (
          <button onClick={onReset} className="text-[9px] px-2 py-0.5 rounded border border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            {t.guide_new}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Local tour */}
        {localTourSteps && localTourIndex < 0 && (
          <button onClick={onLocalTour} className="w-full text-center text-xs py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold border border-primary/20">
            {t.guide_tourThisPage}
          </button>
        )}
        {localTourSteps && localTourIndex >= 0 && (
          <div className="space-y-1.5">
            {localTourSteps.map((s, i) => (
              <div key={`${s.highlight}-${i}`} className={`rounded-lg px-3 py-2 text-[10px] border transition-all ${i === localTourIndex ? "border-primary/40 bg-primary/10" : i < localTourIndex ? "border-border/20 opacity-50" : "border-border/30"}`}>
                <p className="font-semibold">{isAr ? s.titleAr : s.title}</p>
                <p className="text-muted-foreground">{isAr ? s.descriptionAr : s.description}</p>
              </div>
            ))}
            <button onClick={onLocalNext} className="w-full text-center text-[10px] py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold">
              {localTourIndex < localTourSteps.length - 1 ? t.guide_next : t.guide_endTour}
            </button>
          </div>
        )}

        {/* Presets */}
        {!threadId && !isCreating && (
          <>
            <p className="text-xs text-muted-foreground text-center py-1">{t.guide_howCanIHelp}</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {GUIDE_PRESETS.map((p) => (
                <button key={p.id} onClick={() => onSend(isAr ? p.promptAr : p.promptEn)}
                  className="text-[10px] px-2.5 py-1.5 rounded-full border border-border/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary text-muted-foreground transition-all">
                  {isAr ? p.labelAr : p.labelEn}
                </button>
              ))}
            </div>
          </>
        )}

        {isOverBudget && <p className="text-xs text-muted-foreground text-center py-4">{t.guide_budgetReached}</p>}

        {messages?.map((msg) => <MessageBubble key={msg._id} msg={msg} isAr={isAr} currentPage={pathname} isMobile={isMobile} onMinimize={onMinimize} />)}

        {(isWaiting || isCreating) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 size={12} className="animate-spin" />
            <span>{t.guide_thinking}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2 px-4 py-3 border-t border-border/40 flex-shrink-0">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={t.guide_askAnything} dir={dir}
          className="flex-1 text-xs bg-background/60 border border-border/60 rounded-lg px-3 py-2 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          disabled={isOverBudget || isCreating} />
        <button type="submit" disabled={!input.trim() || isOverBudget || isCreating}
          className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

// ─── Main Widget ────────────────────────────────────────────────────────────

export function GuideChat() {
  const { t, lang, dir } = useLanguage();
  const isAr = lang === "ar";
  const _isRtl = dir === "rtl"; // kept for future mobile support
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createThread = useAction(api.guideActions.createThread);
  const sendMessage = useMutation(api.guide.sendMessage);
  const costCheck = useQuery(api.guide.checkMonthlyCost, {});

  const messages = useQuery(api.guide.listMessages, threadId ? { threadId } : "skip");

  const isOverBudget = costCheck?.isOverBudget ?? false;
  const isWaiting = messages?.at(-1)?.role === "user";
  const localTourSteps = PAGE_TOURS[pathname] ?? null;

  // Restore threadId
  useEffect(() => {
    const saved = getThreadId();
    if (saved && !threadId) setThreadId(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Local tour
  const driverRef = useRef<{ destroy: () => void } | null>(null);
  const [localTourIndex, setLocalTourIndex] = useState(-1);

  const highlightLocalStep = useCallback(async (step: LocalTourStep) => {
    if (driverRef.current) { try { driverRef.current.destroy(); } catch {} }
    if (!document.querySelector(step.highlight)) return;
    driverRef.current = await triggerHighlight(step.highlight, isAr ? step.titleAr : step.title, isAr ? step.descriptionAr : step.description);
  }, [isAr]);

  const handleLocalTour = useCallback(() => {
    if (!localTourSteps) return;
    setLocalTourIndex(0);
    highlightLocalStep(localTourSteps[0]);
  }, [localTourSteps, highlightLocalStep]);

  const handleLocalNext = useCallback(() => {
    if (!localTourSteps) return;
    const next = localTourIndex + 1;
    if (next < localTourSteps.length) { setLocalTourIndex(next); highlightLocalStep(localTourSteps[next]); }
    else { setLocalTourIndex(-1); driverRef.current?.destroy(); }
  }, [localTourIndex, localTourSteps, highlightLocalStep]);

  useEffect(() => { setLocalTourIndex(-1); driverRef.current?.destroy(); }, [pathname]);

  // Handlers
  const ensureThread = useCallback(async () => {
    if (threadId) return threadId;
    setIsCreating(true);
    try { const id = await createThread({}); setThreadId(id); saveThreadId(id); return id; }
    finally { setIsCreating(false); }
  }, [threadId, createThread]);

  const handleSend = useCallback(async (text?: string) => {
    if (!text || isOverBudget) return;
    const tid = await ensureThread();
    await sendMessage({ threadId: tid, prompt: text, lang, currentPage: pathname });
  }, [lang, pathname, isOverBudget, ensureThread, sendMessage]);

  const handleReset = useCallback(() => {
    setThreadId(null);
    setLocalTourIndex(-1);
    clearThreadId();
    driverRef.current?.destroy();
  }, []);

  // Shared content props
  const contentProps = {
    isAr, pathname, threadId, messages, isWaiting, isCreating, isOverBudget,
    localTourSteps, localTourIndex, isMobile,
    onSend: handleSend, onReset: handleReset, onLocalTour: handleLocalTour, onLocalNext: handleLocalNext,
    onMinimize: () => {},
  };

  const PANEL_WIDTH = 360;

  // Push app content when panel opens (desktop only)
  useEffect(() => {
    const app = document.getElementById("mizan-app");
    if (!app) return;
    if (isOpen && !isMobile) {
      app.style.marginLeft = `${PANEL_WIDTH}px`;
      app.style.marginRight = "0";
    } else {
      app.style.marginLeft = "0";
      app.style.marginRight = "0";
    }
    return () => { app.style.marginLeft = "0"; app.style.marginRight = "0"; };
  }, [isOpen, isMobile]);

  // Desktop only — no guide chat on mobile
  if (isMobile) return null;

  return (
    <>
      {/* Trigger button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 left-5 z-[100001] flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 transition-transform text-xs font-semibold"
          aria-label={t.guide_ariaLabel}
        >
          <Compass size={14} />
          <span>{t.guide_buttonLabel}</span>
        </button>
      )}

      {/* Side panel (desktop) / Bottom sheet (mobile) */}
      {isOpen && (
        <>
          <div
            className="fixed top-0 left-0 z-[100001] h-full bg-card border-r border-border shadow-xl"
            style={isMobile ? undefined : { width: PANEL_WIDTH }}
            dir={dir}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 end-3 z-10 p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>

            <GuideChatContent {...contentProps} />
          </div>
        </>
      )}
    </>
  );
}
