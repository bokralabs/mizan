import type { ReactNode } from "react";
import {
  ArrowUp,
  CircleCheckBig,
  Clock3,
  ListChecks,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import {
  MetricStripBlock,
  RankingTableBlock,
  TimelineFeedBlock,
  generativeBlockCatalog,
} from "@/components/generative-ui";
import type {
  BlockSource,
  MetricStripBlockData,
  RankingTableBlockData,
  TimelineFeedBlockData,
} from "@/components/generative-ui";

const sharedSources: Array<BlockSource> = [
  {
    id: "world-bank",
    label: "World Bank debt series",
    url: "https://data.worldbank.org",
    publisher: "World Bank",
    lastUpdated: "2026-03-31",
    confidence: "official",
  },
  {
    id: "imf",
    label: "IMF macro forecast",
    url: "https://www.imf.org",
    publisher: "IMF",
    lastUpdated: "2026-04-18",
    confidence: "official",
  },
  {
    id: "mof",
    label: "Ministry of Finance briefing",
    url: "https://mof.gov.eg",
    publisher: "Ministry of Finance",
    lastUpdated: "2026-04-20",
    confidence: "official",
  },
  {
    id: "parliament",
    label: "Parliament portal digest",
    url: "https://www.parliament.gov.eg",
    publisher: "House of Representatives",
    lastUpdated: "2026-04-16",
    confidence: "secondary",
  },
  {
    id: "capmas",
    label: "CAPMAS labor release",
    url: "https://www.capmas.gov.eg",
    publisher: "CAPMAS",
    lastUpdated: "2026-04-11",
    confidence: "official",
  },
];

const fiscalPulseData: MetricStripBlockData = {
  eyebrow: "Metrics",
  heading: "Fiscal pressure points",
  summary:
    "Compact headline metrics for the first screen of a generated answer. Each value stays tied to a source manifest entry and a small change signal.",
  metrics: [
    {
      id: "debt-to-gdp",
      label: "Debt-to-GDP",
      value: "92.4%",
      detail: "Rolling ratio using the latest debt stock and national output estimate.",
      sourceId: "world-bank",
      emphasis: "primary",
      delta: {
        direction: "down",
        label: "-1.3 pts",
        context: "Year over year",
      },
    },
    {
      id: "inflation",
      label: "Inflation forecast",
      value: "18.1%",
      detail: "Expected average price growth for the current fiscal period.",
      sourceId: "imf",
      delta: {
        direction: "down",
        label: "-2.0 pts",
        context: "Quarter over quarter",
      },
    },
    {
      id: "primary-balance",
      label: "Primary balance target",
      value: "+3.5%",
      detail: "Budget target expressed as a share of GDP.",
      sourceId: "mof",
      delta: {
        direction: "up",
        label: "+0.4 pts",
        context: "Budget cycle",
      },
    },
    {
      id: "open-finance-motions",
      label: "Open finance motions",
      value: "27",
      detail: "Parliamentary questions and motions referencing expenditure oversight.",
      sourceId: "parliament",
      delta: {
        direction: "flat",
        label: "Stable",
        context: "Past 30 days",
      },
    },
  ],
  sources: sharedSources,
  footerNote:
    "Storybook examples use realistic mock values. Product numbers must continue to resolve from Convex-backed source records.",
};

const householdPressureData: MetricStripBlockData = {
  eyebrow: "Compact pulse",
  heading: "Household pressure snapshot",
  summary:
    "A tighter metric strip suited to a sidebar or follow-up response where the UI agent only needs a few trusted indicators.",
  metrics: [
    {
      id: "food-inflation",
      label: "Food inflation",
      value: "25.6%",
      detail: "Representative pressure category for household affordability tracking.",
      sourceId: "imf",
      emphasis: "primary",
      delta: {
        direction: "down",
        label: "-1.1 pts",
        context: "Monthly",
      },
    },
    {
      id: "unemployment",
      label: "Unemployment",
      value: "7.1%",
      detail: "Latest headline labor market reading.",
      sourceId: "capmas",
      delta: {
        direction: "flat",
        label: "0.0 pts",
        context: "Quarterly",
      },
    },
  ],
  sources: sharedSources,
  footerNote:
    "Useful when the planner needs a concise answer surface without dropping the source registry.",
};

const oversightRankingData: RankingTableBlockData = {
  eyebrow: "Comparisons",
  heading: "Oversight intensity by institution",
  summary:
    "Wide comparison view for institutions that publish, question, or update public finance data at different cadences.",
  metricLabel: "Oversight score",
  rows: [
    {
      id: "finance-committee",
      label: "Finance and Budget Committee",
      value: "84 / 100",
      score: 84,
      sourceId: "parliament",
      context: "High hearing volume, consistent referrals, and dense questioning around fiscal packages.",
      trend: {
        direction: "up",
        label: "+7",
        context: "Since last session",
      },
    },
    {
      id: "cabinet-media",
      label: "Cabinet media center",
      value: "71 / 100",
      score: 71,
      sourceId: "mof",
      context: "Frequent public briefings but less machine-readable disclosure than core budget sources.",
      trend: {
        direction: "up",
        label: "+3",
        context: "Monthly",
      },
    },
    {
      id: "debt-office",
      label: "Debt management office",
      value: "63 / 100",
      score: 63,
      sourceId: "world-bank",
      context: "Strong quantitative updates with less explanatory narrative for non-specialist readers.",
      trend: {
        direction: "flat",
        label: "0",
        context: "Monthly",
      },
    },
    {
      id: "labor-observatory",
      label: "Labor market observatory",
      value: "58 / 100",
      score: 58,
      sourceId: "capmas",
      context: "Reliable releases, but slower translation into decision-ready accountability views.",
      trend: {
        direction: "down",
        label: "-2",
        context: "Quarterly",
      },
    },
  ],
  sources: sharedSources,
  footerNote:
    "This block works best when the user asks who is doing more, less, or improving across comparable entities.",
};

const trustRankingData: RankingTableBlockData = {
  eyebrow: "Source trust",
  heading: "Source reliability and update freshness",
  summary:
    "A comparison frame for source quality itself, useful when the planner wants to explain confidence before showing a conclusion.",
  metricLabel: "Trust score",
  rows: [
    {
      id: "wb-trust",
      label: "World Bank debt source",
      value: "95 / 100",
      score: 95,
      sourceId: "world-bank",
      context: "Official methodology and consistent revision history.",
      trend: {
        direction: "flat",
        label: "Steady",
        context: "Revision cycle",
      },
    },
    {
      id: "imf-trust",
      label: "IMF forecast source",
      value: "91 / 100",
      score: 91,
      sourceId: "imf",
      context: "Official forecast publication with transparent assumptions.",
      trend: {
        direction: "up",
        label: "+1",
        context: "Method note",
      },
    },
    {
      id: "parliament-trust",
      label: "Parliament digest source",
      value: "74 / 100",
      score: 74,
      sourceId: "parliament",
      context: "Useful legislative context, but less standardized than primary fiscal datasets.",
      trend: {
        direction: "flat",
        label: "Stable",
        context: "Publishing cadence",
      },
    },
  ],
  sources: sharedSources,
};

const accountabilityTimelineData: TimelineFeedBlockData = {
  eyebrow: "Timeline",
  heading: "Latest fiscal and parliamentary signals",
  summary:
    "Chronology block for updates that need dates, impact labels, and evidence tags while remaining compact enough for the generative board.",
  signals: [
    {
      id: "budget-amendment",
      label: "Supplemental allocation package published",
      eventDate: "2026-04-20",
      summary:
        "A new appropriations package introduced line-item shifts across subsidy and infrastructure envelopes, prompting committee review.",
      evidence: ["appropriations note", "committee referral", "line-item delta"],
      sourceId: "mof",
      impact: "high",
    },
    {
      id: "debt-bulletin",
      label: "Quarterly debt bulletin refreshed",
      eventDate: "2026-04-18",
      summary:
        "Debt service composition and maturity profile were updated with a clearer split between domestic and external obligations.",
      evidence: ["maturity profile", "service composition", "quarterly bulletin"],
      sourceId: "world-bank",
      impact: "medium",
    },
    {
      id: "inflation-revision",
      label: "Inflation path revised downward",
      eventDate: "2026-04-16",
      summary:
        "The new forecast baseline softened relative to the prior release and narrowed the expected financing pressure range.",
      evidence: ["forecast table", "baseline revision", "method note"],
      sourceId: "imf",
      impact: "low",
    },
  ],
  sources: sharedSources,
  footerNote:
    "Timelines work well for 'what changed recently?' prompts where provenance matters as much as sequence.",
};

const publicationTimelineData: TimelineFeedBlockData = {
  eyebrow: "Process tracking",
  heading: "How a data point becomes publishable",
  summary:
    "A process-oriented timeline pattern for showing trust-building steps from source update to public explanation.",
  signals: [
    {
      id: "source-refresh",
      label: "Official release collected",
      eventDate: "2026-04-18",
      summary:
        "The source manifest recorded a fresh debt bulletin and updated the last accessed timestamp.",
      evidence: ["source refresh", "lastAccessedDate", "official release"],
      sourceId: "world-bank",
      impact: "low",
    },
    {
      id: "cross-check",
      label: "Cross-source consistency check passed",
      eventDate: "2026-04-19",
      summary:
        "Headline values aligned with forecast notes and budget framing before the UI exposed the metric publicly.",
      evidence: ["cross-check", "forecast note", "budget framing"],
      sourceId: "imf",
      impact: "medium",
    },
    {
      id: "public-summary",
      label: "Board-ready summary rendered",
      eventDate: "2026-04-20",
      summary:
        "The generated answer surfaced only sourced metrics, comparisons, and links rather than unsupported prose claims.",
      evidence: ["typed payload", "source registry", "board render"],
      sourceId: "mof",
      impact: "high",
    },
  ],
  sources: sharedSources,
};

function StoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="mizan-workbench min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">{children}</div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <p className="workbench-label text-primary">
        {eyebrow}
      </p>
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function CatalogCards() {
  const purposeLabels: Record<string, string> = {
    metricStrip: "Metrics and pulse",
    rankingTable: "Comparisons and rankings",
    timelineFeed: "Timelines and process",
  };

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {generativeBlockCatalog.map((block) => (
        <article
          key={block.kind}
          className="workbench-panel rounded-[9px] bg-card/90 p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="workbench-label text-primary">
              {block.kind}
            </p>
            <span className="rounded-[6px] border border-border/70 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">
              {purposeLabels[block.kind]}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            {block.label}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {block.description}
          </p>
        </article>
      ))}
    </section>
  );
}

function LiveWorkbenchPreview() {
  const steps = [
    "Read the budget question",
    "Choose metric and timeline blocks",
    "Attach source registry",
    "Reveal the board",
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="workbench-panel rounded-[9px] bg-card/90 p-3">
        <div className="flex items-center justify-between gap-3 rounded-[6px] border border-border/70 bg-background/75 px-3 py-2">
          <div>
            <p className="workbench-label text-primary">Mizan</p>
            <p className="text-xs text-muted-foreground">Live chat</p>
          </div>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-[6px] border border-border/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
            <RotateCcw size={12} />
            Reset
          </button>
        </div>

        <div className="mt-3 space-y-3 rounded-[9px] border border-border/70 bg-background/70 p-3">
          <div className="ms-auto max-w-[90%] rounded-[9px] border border-border bg-primary/15 px-3 py-2 text-xs leading-5">
            Show the budget gap and what changed recently.
          </div>
          <div className="rounded-[9px] border border-primary bg-primary/10 px-3 py-2">
            <span className="workbench-label inline-flex items-center gap-2 text-primary">
              <span className="size-2 rounded-full bg-primary" />
              Building view
            </span>
            <p className="mt-2 text-sm font-semibold leading-5">
              Adding a sourced budget pulse and a recent-signal timeline.
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 text-[0.68rem] text-muted-foreground">
              <span>Fiscal pressure points</span>
              <span className="font-mono">2 blocks</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-[9px] border border-border bg-background/80 p-2">
          <MessageSquareText size={16} className="ms-2 text-muted-foreground" />
          <div className="min-h-10 flex-1 py-2 text-sm text-muted-foreground">Ask a follow-up...</div>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-primary bg-primary text-primary-foreground">
            <ArrowUp size={16} />
          </button>
        </div>
      </aside>

      <section className="workbench-panel rounded-[9px] bg-card/90 p-5">
        <div className="grid gap-4 border-b border-border/80 pb-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="workbench-label rounded-[6px] border border-primary bg-primary/15 px-2.5 py-1 text-primary">
                json-render
              </span>
              <span className="rounded-[6px] border border-primary bg-primary/15 px-2.5 py-1 text-xs font-semibold">
                Adding to the page
              </span>
            </div>
            <div>
              <h2 className="text-3xl font-black leading-tight">Budget pressure workbench</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                The answer renders as compact sourced blocks while the chat keeps the decision trail visible.
              </p>
            </div>
            <div className="grid gap-2 rounded-[6px] border border-border/70 bg-background/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="workbench-label text-muted-foreground">LIVE RENDER</span>
                <span className="font-mono text-[0.7rem] font-semibold text-muted-foreground">2/3 blocks</span>
              </div>
              <div className="h-2 overflow-hidden rounded-[3px] bg-muted">
                <div className="h-full w-full origin-left rounded-[3px] bg-primary" style={{ transform: "scaleX(0.66)" }} />
              </div>
            </div>
          </div>

          <div className="workbench-panel rounded-[9px] bg-card/90 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="workbench-label inline-flex items-center gap-2 text-muted-foreground">
                <ListChecks size={13} className="text-primary" />
                Build queue
              </span>
              <span className="rounded-[6px] border border-primary bg-primary/15 px-2 py-1 text-[0.65rem] font-semibold">
                Rendering
              </span>
            </div>
            <div className="grid gap-2">
              {steps.map((step, index) => {
                const complete = index < 2;
                const Icon = complete ? CircleCheckBig : Clock3;

                return (
                  <div
                    key={step}
                    className={
                      complete
                        ? "grid grid-cols-[18px_1fr] gap-2 rounded-[6px] border border-primary/70 bg-primary/10 px-2.5 py-2 text-xs leading-5"
                        : "grid grid-cols-[18px_1fr] gap-2 rounded-[6px] border border-border/50 bg-background/70 px-2.5 py-2 text-xs leading-5 text-muted-foreground"
                    }
                  >
                    <Icon className={complete ? "mt-0.5 size-3.5 text-primary" : "mt-0.5 size-3.5 text-muted-foreground"} />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-5 py-5">
          <MetricStripBlock {...fiscalPulseData} />
          <TimelineFeedBlock {...accountabilityTimelineData} />
        </div>
      </section>
    </div>
  );
}

const meta = {
  title: "Generative UI/Blocks",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const LiveChatWorkbench = {
  render: () => (
    <StoryShell>
      <SectionHeader
        eyebrow="Chat surface"
        title="Live chat with generated UI rendering"
        description="A workbench composition for the home chat rail, render queue, and deterministic answer blocks."
      />
      <LiveWorkbenchPreview />
    </StoryShell>
  ),
};

export const StoryboardCatalog = {
  render: () => (
    <StoryShell>
      <section className="workbench-panel rounded-[9px] bg-card/90 p-7">
        <div className="space-y-4">
          <p className="workbench-label text-primary">
            Generative UI storyboard
          </p>
          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold text-foreground">
              Catalog of deterministic answer blocks for the Mizan board
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              A single storyboard for all currently available generative UI
              components, grouped by the kind of civic answer they are meant to
              carry: metrics, comparisons, timelines, and source trust.
            </p>
          </div>
        </div>
      </section>

      <CatalogCards />

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Metrics"
          title="Headline pulse and compact follow-ups"
          description="Metric strips should cover both first-screen summaries and tighter sidebar layouts without losing provenance."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <MetricStripBlock {...fiscalPulseData} />
          <div className="xl:pt-10">
            <MetricStripBlock {...householdPressureData} />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Comparisons"
          title="Institutional rankings and trust scoring"
          description="Ranking tables are the comparison workhorse: full-width for institutions, or narrower when the answer needs to explain source quality itself."
        />
        <RankingTableBlock {...oversightRankingData} />
        <div className="mx-auto w-full max-w-5xl">
          <RankingTableBlock {...trustRankingData} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Timeline and trust"
          title="Chronology, process, and evidence"
          description="Timeline blocks cover recent events and internal publishability steps, so the user can see both what changed and why the board trusts it."
        />
        <div className="grid gap-6 2xl:grid-cols-2">
          <TimelineFeedBlock {...accountabilityTimelineData} />
          <TimelineFeedBlock {...publicationTimelineData} />
        </div>
      </section>
    </StoryShell>
  ),
};

export const MetricStrips = {
  render: () => (
    <StoryShell>
      <SectionHeader
        eyebrow="Metrics"
        title="Metric strip layouts"
        description="Wide and compact metric strip variants using the same deterministic block API."
      />
      <MetricStripBlock {...fiscalPulseData} />
      <div className="mx-auto w-full max-w-3xl">
        <MetricStripBlock {...householdPressureData} />
      </div>
    </StoryShell>
  ),
};

export const RankingTables = {
  render: () => (
    <StoryShell>
      <SectionHeader
        eyebrow="Comparisons"
        title="Ranking table layouts"
        description="A primary institutional ranking plus a narrower trust-oriented comparison."
      />
      <RankingTableBlock {...oversightRankingData} />
      <div className="mx-auto w-full max-w-5xl">
        <RankingTableBlock {...trustRankingData} />
      </div>
    </StoryShell>
  ),
};

export const TimelineFeeds = {
  render: () => (
    <StoryShell>
      <SectionHeader
        eyebrow="Timeline"
        title="Timeline feed layouts"
        description="Recent-event and process-tracking timelines using the same structured chronology block."
      />
      <div className="grid gap-6 2xl:grid-cols-2">
        <TimelineFeedBlock {...accountabilityTimelineData} />
        <TimelineFeedBlock {...publicationTimelineData} />
      </div>
    </StoryShell>
  ),
};
