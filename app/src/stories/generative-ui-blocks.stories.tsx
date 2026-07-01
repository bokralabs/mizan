import { Renderer } from "@openuidev/react-lang";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { mizanOpenUiLibrary } from "@/lib/mizan-openui-library";
import {
  buildMizanOpenUiToolProvider,
  type HomeStats,
  type InvestmentDefaults,
} from "@/lib/mizan-openui-tools";

const sampleStats: HomeStats = {
  parliamentarians: {
    value: 896,
    house: 596,
    senate: 300,
    sourceUrl: "https://www.parliament.gov.eg",
    sanadLevel: 1,
  },
  governorates: {
    value: 27,
    sourceUrl: "https://www.presidency.eg",
    sanadLevel: 1,
  },
  constitutionArticles: {
    value: 247,
    sourceUrl: "https://www.constituteproject.org/constitution/Egypt_2019",
    sanadLevel: 2,
  },
  ministries: {
    value: 31,
    sourceUrl: "https://www.cabinet.gov.eg",
    sanadLevel: 1,
  },
  externalDebt: {
    value: 156_000_000_000,
    sourceUrl: "https://www.cbe.org.eg",
    sanadLevel: 1,
  },
  domesticDebt: {
    value: 7_200_000_000_000,
    sourceUrl: "https://mof.gov.eg",
    sanadLevel: 1,
  },
  totalDebt: {
    value: 310_000_000_000,
    debtToGdpRatio: 89.5,
    sourceUrl: "https://api.worldbank.org",
    sanadLevel: 2,
  },
  budget: {
    year: "2024/2025",
    totalRevenue: 2_600,
    totalExpenditure: 3_900,
    deficit: -1_300,
    sourceUrl: "https://mof.gov.eg",
    sanadLevel: 1,
  },
};

const sampleInvestmentDefaults: InvestmentDefaults = {
  cbe_cd_rate: {
    value: 23.5,
    unit: "%",
    date: "2026-06-01",
    sanadLevel: 1,
    sourceUrl: "https://www.cbe.org.eg",
  },
  egypt_tbill_rate: {
    value: 25.1,
    unit: "%",
    date: "2026-06-01",
    sanadLevel: 1,
    sourceUrl: "https://mof.gov.eg",
  },
  inflation: {
    value: 16.8,
    unit: "%",
    date: "2026-06-01",
    sanadLevel: 2,
    sourceUrl: "https://www.capmas.gov.eg",
  },
  exchange_rate: {
    value: 48.7,
    unit: "EGP/USD",
    date: "2026-06-01",
    sanadLevel: 1,
    sourceUrl: "https://www.cbe.org.eg",
  },
  egx30_annual_return: {
    value: 31.2,
    unit: "%",
    date: "2026-06-01",
    sanadLevel: 2,
    sourceUrl: "https://www.egx.com.eg",
  },
};

const debtProgram = [
  'root = Workspace([status, header, metrics, chart, table, sources, next], "Mizan", "Sourced data view", "en")',
  'data = Query("mizan_search", {query: "debt status", lang: "en", domain: "debt"}, {title: "Mizan data", summary: "", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)',
  "status = QueryStatus()",
  'header = Section(data.title, data.summary, [], "default")',
  'metrics = Grid(@Each(data.metrics, "m", Metric(m.label, m.value, m.detail, m.sourceLabel, m.sourceUrl, m.confidence)), 3)',
  'chart = BarChart("Visual comparison", data.series, "label", "value")',
  'table = DataTable("Rows", data.rows)',
  'sources = SourceList("Sources", data.sources)',
  "next = PromptActions(data.prompts)",
].join("\n");

const investmentProgram = [
  'root = Workspace([status, tool, next], "Mizan", "Scenario context, not advice", "en")',
  'data = Query("mizan_simulate_investment", {capitalEgp: 100000, horizonYears: 5, strategies: ["balanced", "fixedIncome", "egyptianGrowth"], lang: "en"}, {title: "Scenario", summary: "", rows: [], series: [], sources: [], insights: [], prompts: []})',
  "status = QueryStatus()",
  "tool = ScenarioTool(data.title, data.summary, data.rows, data.series, data.sources, data.insights, 100000, 10000, 5000000, 10000, 5, 1, 30)",
  "next = PromptActions(data.prompts)",
].join("\n");

const sourceProgram = [
  'root = Workspace([status, quality, evidence, sources, next], "Mizan", "Source quality view", "en")',
  'data = Query("mizan_search", {query: "are the sources reliable", lang: "en", domain: "sources"}, {title: "Sources", summary: "", metrics: [], rows: [], series: [], sources: [], insights: [], prompts: []}, 300)',
  "status = QueryStatus()",
  'quality = SourceQualityPanel("Source quality", data.sources)',
  'evidence = EvidencePanel("Evidence rows", data.summary, data.rows, data.sources)',
  'sources = SourceList("Sources", data.sources)',
  "next = PromptActions(data.prompts)",
].join("\n");

function RuntimeStory({ program }: { program: string }) {
  const toolProvider = useMemo(() => buildMizanOpenUiToolProvider({
    stats: sampleStats,
    investmentDefaults: sampleInvestmentDefaults,
    lang: "en",
  }), []);

  return (
    <main className="mizan-workbench min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-6xl">
        <Renderer
          response={program}
          library={mizanOpenUiLibrary}
          toolProvider={toolProvider}
          queryLoader={(
            <div className="inline-flex min-h-8 items-center gap-2 rounded-[6px] border border-border bg-background px-2.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Reading sources
            </div>
          )}
        />
      </div>
    </main>
  );
}

const meta = {
  title: "Generative UI/Mizan Runtime",
  component: RuntimeStory,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof RuntimeStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DebtView: Story = {
  args: {
    program: debtProgram,
  },
};

export const InvestmentScenario: Story = {
  args: {
    program: investmentProgram,
  },
};

export const SourceQuality: Story = {
  args: {
    program: sourceProgram,
  },
};
