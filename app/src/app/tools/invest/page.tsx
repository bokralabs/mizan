"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useLanguage } from "@/components/providers";
import { useWebMCPTool, mcpJSON } from "@/lib/webmcp";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SanadBadge } from "@/components/sanad-badge";
import { DataSourceFooter } from "@/components/data-source";
import { motion } from "framer-motion";
import { DesktopNotice } from "@/components/desktop-notice";
import {
  ResponsiveContainer,
  AreaChart,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { AlertTriangle, Info, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { AdjustableSlider } from "@/components/adjustable-slider";
import { Slider } from "@/components/ui/slider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset {
  key: string;
  nameEn: string;
  nameAr: string;
  convexKey: string;
  defaultReturn: number; // Price appreciation only
  volatility: number;
  yieldPct?: number; // Income yield (rent, dividends) — added to total return
  yieldLabelEn?: string;
  yieldLabelAr?: string;
}

interface AssetGroup {
  key: string;
  nameEn: string;
  nameAr: string;
  color: string;
  assets: Asset[];
}

// Flat asset with group metadata (used in projection math and charts)
interface FlatAsset extends Asset {
  groupColor: string;
  groupKey: string;
}

interface YearProjection {
  year: number;
  total: number;
  real: number;
  usdTotal: number;
  byAsset: Record<string, number>;
}

interface Preset {
  nameEn: string;
  nameAr: string;
  allocation: Record<string, number>;
}

type AllocationMap = Record<string, number>;

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_GROUPS: AssetGroup[] = [
  {
    key: "egyptian_stocks",
    nameEn: "Egyptian Stocks",
    nameAr: "الأسهم المصرية",
    color: "#C9A84C",
    assets: [
      { key: "egx30", nameEn: "EGX 30 Index", nameAr: "مؤشر البورصة EGX 30", convexKey: "egx30_annual_return", defaultReturn: 18.5, volatility: 25, yieldPct: 2.5, yieldLabelEn: "Dividend yield", yieldLabelAr: "عائد الأرباح الموزعة" },
    ],
  },
  {
    key: "bank_cds",
    nameEn: "Bank Certificates",
    nameAr: "شهادات بنكية",
    color: "#6C8EEF",
    assets: [
      { key: "banque_misr_1yr", nameEn: "Banque Misr 1yr", nameAr: "بنك مصر — سنة", convexKey: "banque_misr_cd_1yr", defaultReturn: 16, volatility: 1 },
      { key: "banque_misr_3yr", nameEn: "Banque Misr 3yr", nameAr: "بنك مصر — ٣ سنوات", convexKey: "banque_misr_cd_3yr", defaultReturn: 16, volatility: 1 },
      { key: "nbe_1yr", nameEn: "NBE 1yr", nameAr: "البنك الأهلي — سنة", convexKey: "nbe_cd_1yr", defaultReturn: 16, volatility: 1 },
      { key: "nbe_3yr", nameEn: "NBE 3yr Platinum", nameAr: "البنك الأهلي — بلاتينوم ٣ سنوات", convexKey: "nbe_cd_3yr", defaultReturn: 16, volatility: 1 },
      { key: "cib_1yr", nameEn: "CIB 1yr", nameAr: "CIB — سنة", convexKey: "cib_cd_1yr", defaultReturn: 14, volatility: 1 },
      { key: "cib_floating", nameEn: "CIB Floating", nameAr: "CIB — عائد متغير", convexKey: "cib_cd_floating", defaultReturn: 17, volatility: 2 },
    ],
  },
  {
    key: "gov_fixed_income",
    nameEn: "Government Fixed Income",
    nameAr: "دخل ثابت حكومي",
    color: "#3FC380",
    assets: [
      { key: "tbills", nameEn: "Treasury Bills (91-day)", nameAr: "أذون خزانة", convexKey: "egypt_tbill_rate", defaultReturn: 25.7, volatility: 3 },
      { key: "cert_1yr", nameEn: "Savings Cert 1yr", nameAr: "شهادة ادخار — سنة", convexKey: "egypt_savings_cert_1yr", defaultReturn: 16, volatility: 1 },
      { key: "cert_3yr", nameEn: "Savings Cert 3yr", nameAr: "شهادة ادخار — ٣ سنوات", convexKey: "egypt_savings_cert_3yr", defaultReturn: 16, volatility: 1 },
      { key: "cert_5yr", nameEn: "Savings Cert 5yr", nameAr: "شهادة ادخار — ٥ سنوات", convexKey: "egypt_savings_cert_5yr", defaultReturn: 14, volatility: 1 },
    ],
  },
  {
    key: "real_estate",
    nameEn: "Real Estate",
    nameAr: "العقارات",
    color: "#2EC4B6",
    assets: [
      { key: "realEstate", nameEn: "Egyptian Real Estate", nameAr: "العقارات المصرية", convexKey: "egypt_real_estate_return", defaultReturn: 15, volatility: 12, yieldPct: 4, yieldLabelEn: "Rental income", yieldLabelAr: "دخل الإيجار" },
    ],
  },
  {
    key: "gold",
    nameEn: "Gold",
    nameAr: "الذهب",
    color: "#F59E0B",
    assets: [
      { key: "gold", nameEn: "Gold (EGP)", nameAr: "الذهب بالجنيه", convexKey: "gold_annual_return", defaultReturn: 20, volatility: 18 },
    ],
  },
  {
    key: "international",
    nameEn: "International",
    nameAr: "أسواق دولية",
    color: "#8B5CF6",
    assets: [
      { key: "sp500", nameEn: "S&P 500 (USD)", nameAr: "S&P 500", convexKey: "sp500_annual_return", defaultReturn: 10, volatility: 15, yieldPct: 1.5, yieldLabelEn: "Dividend yield", yieldLabelAr: "عائد الأرباح الموزعة" },
      { key: "msciEm", nameEn: "MSCI Emerging Markets", nameAr: "الأسواق الناشئة", convexKey: "msci_em_return", defaultReturn: 7.5, volatility: 20, yieldPct: 2.5, yieldLabelEn: "Dividend yield", yieldLabelAr: "عائد الأرباح الموزعة" },
    ],
  },
];

// Flat list of all assets (for projection math and charts)
const ALL_ASSETS: FlatAsset[] = ASSET_GROUPS.flatMap((g) =>
  g.assets.map((a) => ({ ...a, groupColor: g.color, groupKey: g.key }))
);

const CAPITAL_STEPS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000];
const QUICK_CAPITALS = [100_000, 500_000, 1_000_000, 5_000_000];

function closestCapitalIndex(target: number): number {
  let closest = 0;
  for (let i = 0; i < CAPITAL_STEPS.length; i++) {
    if (Math.abs(CAPITAL_STEPS[i] - target) < Math.abs(CAPITAL_STEPS[closest] - target)) closest = i;
  }
  return closest;
}

function numberParam(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const PRESETS: Record<string, Preset> = {
  conservative: {
    nameEn: "Conservative",
    nameAr: "آمن",
    allocation: { banque_misr_3yr: 25, nbe_3yr: 25, cert_3yr: 15, tbills: 15, gold: 10, realEstate: 10 },
  },
  balanced: {
    nameEn: "Balanced",
    nameAr: "متوازن",
    allocation: { egx30: 20, realEstate: 20, banque_misr_1yr: 10, nbe_1yr: 10, tbills: 10, gold: 15, cert_1yr: 10, sp500: 5 },
  },
  aggressive: {
    nameEn: "Aggressive",
    nameAr: "مغامر",
    allocation: { egx30: 35, realEstate: 20, sp500: 15, gold: 10, msciEm: 10, tbills: 5, banque_misr_1yr: 5 },
  },
  fixedIncome: {
    nameEn: "Fixed Income",
    nameAr: "دخل ثابت",
    allocation: { banque_misr_3yr: 15, nbe_3yr: 15, cib_1yr: 10, cert_3yr: 20, cert_5yr: 15, tbills: 25 },
  },
  egyptianGrowth: {
    nameEn: "Egyptian Growth",
    nameAr: "نمو مصري",
    allocation: { egx30: 40, realEstate: 25, gold: 20, banque_misr_1yr: 15 },
  },
};

const DEFAULT_INFLATION = 12; // Long-term estimate (IMF projects ~7% by 2027, historical avg ~10-15%)
const DEFAULT_HORIZON = 10;
const DEFAULT_CAPITAL_INDEX = 4; // 1M
const DEFAULT_DEPRECIATION = 7;

const ASSET_TOOLTIPS: Record<string, { en: string; ar: string }> = {
  egx30: {
    en: "Egyptian stock market index. High returns but volatile. Best for long-term (5+ years).",
    ar: "مؤشر البورصة المصرية. عوائد عالية لكن متقلب. الأفضل للمدى الطويل.",
  },
  realEstate: {
    en: "Egyptian property appreciation. Illiquid — hard to sell quickly. Good inflation hedge.",
    ar: "ارتفاع قيمة العقارات. غير سائل — صعب البيع بسرعة. حماية جيدة من التضخم.",
  },
  banque_misr_1yr: {
    en: "Fixed-rate certificate from Banque Misr. Guaranteed returns for 1 year. Very safe.",
    ar: "شهادة ادخار ثابتة من بنك مصر. عائد مضمون لمدة سنة. آمنة جداً.",
  },
  banque_misr_3yr: {
    en: "Fixed-rate certificate from Banque Misr. Guaranteed returns for 3 years. Very safe.",
    ar: "شهادة ادخار ثابتة من بنك مصر. عائد مضمون لمدة ٣ سنوات. آمنة جداً.",
  },
  nbe_1yr: {
    en: "Fixed-rate certificate from National Bank of Egypt. Guaranteed returns for 1 year. Very safe.",
    ar: "شهادة ادخار ثابتة من البنك الأهلي. عائد مضمون لمدة سنة. آمنة جداً.",
  },
  nbe_3yr: {
    en: "Platinum certificate from National Bank of Egypt. Guaranteed returns for 3 years. Very safe.",
    ar: "شهادة بلاتينوم من البنك الأهلي. عائد مضمون لمدة ٣ سنوات. آمنة جداً.",
  },
  cib_1yr: {
    en: "Fixed-rate certificate from CIB. Guaranteed returns for 1 year. Very safe.",
    ar: "شهادة ادخار ثابتة من CIB. عائد مضمون لمدة سنة. آمنة جداً.",
  },
  cib_floating: {
    en: "Floating-rate certificate from CIB. Rate adjusts with market. Slightly higher risk than fixed.",
    ar: "شهادة بعائد متغير من CIB. العائد يتغير مع السوق. مخاطر أعلى قليلاً من الثابتة.",
  },
  tbills: {
    en: "Egyptian government treasury bills. Very safe, slightly higher yield than CDs, shorter terms.",
    ar: "أذون خزانة حكومية. آمنة جداً، عائد أعلى قليلاً من الشهادات.",
  },
  cert_1yr: {
    en: "Government savings certificate. Backed by Egyptian government. 1 year commitment.",
    ar: "شهادة ادخار حكومية. مضمونة من الحكومة المصرية. التزام لمدة سنة.",
  },
  cert_3yr: {
    en: "Government savings certificate. Backed by Egyptian government. 3 year commitment.",
    ar: "شهادة ادخار حكومية. مضمونة من الحكومة المصرية. التزام لمدة ٣ سنوات.",
  },
  cert_5yr: {
    en: "Government savings certificate. Backed by Egyptian government. 5 year commitment.",
    ar: "شهادة ادخار حكومية. مضمونة من الحكومة المصرية. التزام لمدة ٥ سنوات.",
  },
  gold: {
    en: "Price in EGP includes both global gold movement and EGP depreciation. Good crisis hedge.",
    ar: "السعر بالجنيه يشمل حركة الذهب العالمية وانخفاض الجنيه. حماية جيدة في الأزمات.",
  },
  sp500: {
    en: "US stock market. Returns in USD — benefits from EGP depreciation but has currency risk if EGP strengthens.",
    ar: "السوق الأمريكي. العوائد بالدولار — يستفيد من انخفاض الجنيه.",
  },
  msciEm: {
    en: "Emerging markets index (includes Egypt, India, Brazil, etc.). Diversified but volatile.",
    ar: "مؤشر الأسواق الناشئة. متنوع لكن متقلب.",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-EG").format(Math.round(n));
}

function projectPortfolio(
  capital: number,
  horizon: number,
  allocation: AllocationMap,
  returns: Record<string, number>,
  inflation: number,
  exchangeRate: number,
  depreciationPct: number
): YearProjection[] {
  const result: YearProjection[] = [];
  const assetValues: Record<string, number> = {};

  for (const [key, pct] of Object.entries(allocation)) {
    assetValues[key] = capital * (pct / 100);
  }

  for (let year = 0; year <= horizon; year++) {
    const byAsset = { ...assetValues };
    const total = Object.values(byAsset).reduce((s, v) => s + v, 0);
    const real = total / Math.pow(1 + inflation / 100, year);
    const usdTotal = total / (exchangeRate * Math.pow(1 + depreciationPct / 100, year));
    result.push({ year, total, real, usdTotal, byAsset });

    for (const key of Object.keys(assetValues)) {
      const rate = returns[key] ?? 0;
      assetValues[key] *= 1 + rate / 100;
    }
  }
  return result;
}

function calcWeightedVolatility(allocation: AllocationMap): number {
  let weighted = 0;
  let total = 0;
  for (const asset of ALL_ASSETS) {
    const pct = allocation[asset.key] ?? 0;
    weighted += pct * asset.volatility;
    total += pct;
  }
  return total > 0 ? weighted / total : 0;
}

// ─── Input Tooltip ────────────────────────────────────────────────────────────

function InputTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const show = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: Math.max(8, rect.left - 100) });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => open ? setOpen(false) : show()}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-help"
      >
        <Info size={12} />
      </button>
      {open && createPortal(
        <div
          className="fixed w-64 p-3 rounded-lg bg-popover border border-border shadow-2xl text-[0.7rem] text-muted-foreground leading-relaxed"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
  label?: string | number;
  isAr: boolean;
}

function DarkTooltip({ active, payload, label, isAr: _isAr, yearLabel, totalLabel }: CustomTooltipProps & { yearLabel: string; totalLabel: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-[#1a1d27] border border-border/60 rounded-lg p-3 shadow-xl text-xs min-w-[200px]">
      <p className="text-muted-foreground mb-2 font-semibold">
        {yearLabel} {label}
      </p>
      {payload.map((p, idx) => (
        <div key={`${p.name ?? ""}-${idx}`} className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-mono font-bold text-foreground">{fmtCompact(p.value ?? 0)}</span>
        </div>
      ))}
      <Separator className="my-2" />
      <div className="flex justify-between font-bold">
        <span className="text-muted-foreground">{totalLabel}</span>
        <span className="font-mono text-primary">{fmtCompact(total)}</span>
      </div>
    </div>
  );
}

interface RaceTipProps {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
  label?: string | number;
  isAr: boolean;
}

function RaceTooltip({ active, payload, label, isAr: _isAr, yearLabel }: RaceTipProps & { yearLabel: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="bg-[#1a1d27] border border-border/60 rounded-lg p-3 shadow-xl text-xs min-w-[200px]">
      <p className="text-muted-foreground mb-2 font-semibold">
        {yearLabel} {label}
      </p>
      {sorted.map((p, idx) => (
        <div key={`${p.name ?? ""}-${idx}`} className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-mono font-bold text-foreground">{fmtCompact(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestPage() {
  const { t, lang, dir } = useLanguage();
  const [prefillQuery, setPrefillQuery] = useState("");
  const isAr = lang === "ar";
  // Translation helper for keys not yet in translations.ts — will be added in a follow-up
  
  // This tool always works in EGP
  const fmtVal = (egpAmount: number) => `${fmtCompact(egpAmount)} EGP`;

  // Convex data
  const convexDefaults = useQuery(api.tools.getInvestmentDefaults);

  // State
  const [capitalIdx, setCapitalIdx] = usePersistedState("invest-capitalIdx", DEFAULT_CAPITAL_INDEX);
  const [horizon, setHorizon] = usePersistedState("invest-horizon", DEFAULT_HORIZON);
  const defaultAllocation: AllocationMap = useMemo(() => {
    const m: AllocationMap = {};
    for (const a of ALL_ASSETS) m[a.key] = 0;
    return { ...m, ...PRESETS.balanced.allocation };
  }, []);
  const [allocation, setAllocation] = usePersistedState<AllocationMap>("invest-allocation", defaultAllocation);
  const [activePreset, setActivePreset] = usePersistedState<string>("invest-activePreset", "balanced");
  const [inflationPct, setInflationPct] = usePersistedState("invest-inflationPct", DEFAULT_INFLATION);
  const [depreciationPct, setDepreciationPct] = usePersistedState("invest-depreciationPct", DEFAULT_DEPRECIATION);
  const [showMethodology, setShowMethodology] = useState(false);
  const appliedPrefillRef = useRef("");
  // User-adjustable yield per asset (dividends, rent). Defaults from asset definition.
  const defaultYieldOverrides: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of ALL_ASSETS) {
      if (a.yieldPct) m[a.key] = a.yieldPct;
    }
    return m;
  }, []);
  const [yieldOverrides, setYieldOverrides] = usePersistedState<Record<string, number>>("invest-yieldOverrides", defaultYieldOverrides);
  const handleYieldChange = useCallback((key: string, value: number) => {
    setYieldOverrides((prev) => ({ ...prev, [key]: value }));
  }, [setYieldOverrides]);

  useEffect(() => {
    setPrefillQuery(window.location.search.replace(/^\?/, ""));
  }, []);

  const capital = CAPITAL_STEPS[capitalIdx] ?? 1_000_000;

  // Build effective returns: price appreciation (from Convex or default) + user yield override
  const effectiveReturns = useMemo<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    for (const asset of ALL_ASSETS) {
      const convexRecord = asset.convexKey ? convexDefaults?.[asset.convexKey] : undefined;
      const convexValue = convexRecord?.value;
      const priceReturn = (convexValue !== undefined && convexValue <= 100) ? convexValue : asset.defaultReturn;
      const yieldReturn = yieldOverrides[asset.key] ?? 0;
      r[asset.key] = priceReturn + yieldReturn;
    }
    return r;
  }, [convexDefaults, yieldOverrides]);

  const inflation = inflationPct;

  const exchangeRate = useMemo(() => {
    return convexDefaults?.["exchange_rate"]?.value ?? 50;
  }, [convexDefaults]);

  // Projection data
  const projections = useMemo(() => {
    return projectPortfolio(capital, horizon, allocation, effectiveReturns, inflation, exchangeRate, depreciationPct);
  }, [capital, horizon, allocation, effectiveReturns, inflation, exchangeRate, depreciationPct]);

  // Asset race data — one representative per group (not all 14)
  const RACE_ASSETS = useMemo(() => {
    // Pick the first asset from each group as representative
    return ASSET_GROUPS.map((g) => ({
      key: g.assets[0].key,
      nameEn: g.nameEn,
      nameAr: g.nameAr,
      color: g.color,
      convexKey: g.assets[0].convexKey,
      defaultReturn: g.assets[0].defaultReturn,
    }));
  }, []);

  const raceData = useMemo(() => {
    const years = Array.from({ length: horizon + 1 }, (_, i) => i);
    return years.map((year) => {
      const point: Record<string, number> = { year };
      for (const asset of RACE_ASSETS) {
        const rate = effectiveReturns[asset.key] ?? asset.defaultReturn;
        point[asset.key] = capital * Math.pow(1 + rate / 100, year);
      }
      return point;
    });
  }, [capital, horizon, effectiveReturns, RACE_ASSETS]);

  // Totals
  const totalAllocation = Object.values(allocation).reduce((s, v) => s + v, 0);
  const isValid = Math.abs(totalAllocation - 100) < 0.5;
  const finalValue = projections[projections.length - 1]?.total ?? capital;
  const finalReal = projections[projections.length - 1]?.real ?? capital;
  const finalUsd = projections[projections.length - 1]?.usdTotal ?? capital / exchangeRate;
  const riskScore = calcWeightedVolatility(allocation);
  const cashFinalValue = capital / Math.pow(1 + inflation / 100, horizon);

  // Chart data
  const stackedData = projections.map((p) => {
    const point: Record<string, number> = { year: p.year };
    for (const asset of ALL_ASSETS) {
      const egpVal = p.byAsset[asset.key] ?? 0;
      point[asset.key] = Math.round(egpVal);
    }
    point.real = Math.round(p.real);
    return point;
  });

  // Track which groups are expanded in the allocation panel
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Default: expand groups that have allocation in the balanced preset
    const balancedKeys = new Set(Object.keys(PRESETS.balanced.allocation));
    return new Set(
      ASSET_GROUPS
        .filter((g) => g.assets.some((a) => balancedKeys.has(a.key)))
        .map((g) => g.key)
    );
  });

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // Handlers
  const handleAllocationChange = useCallback((key: string, value: number) => {
    setAllocation((prev) => ({ ...prev, [key]: value }));
    setActivePreset("");
  }, [setAllocation, setActivePreset]);

  const applyPreset = useCallback((presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    const full: AllocationMap = {};
    for (const a of ALL_ASSETS) full[a.key] = 0;
    const merged = { ...full, ...preset.allocation };
    setAllocation(merged);
    setActivePreset(presetKey);
    // Auto-expand groups that have allocation in this preset
    const presetKeys = new Set(Object.keys(preset.allocation));
    setExpandedGroups(new Set(
      ASSET_GROUPS
        .filter((g) => g.assets.some((a) => presetKeys.has(a.key)))
        .map((g) => g.key)
    ));
  }, [setAllocation, setActivePreset]);

  useEffect(() => {
    if (!prefillQuery || appliedPrefillRef.current === prefillQuery) return;

    const params = new URLSearchParams(prefillQuery);
    let applied = false;

    const capitalEgp = numberParam(params, "capitalEgp");
    if (capitalEgp !== null && capitalEgp > 0) {
      setCapitalIdx(closestCapitalIndex(capitalEgp));
      applied = true;
    }

    const horizonYears = numberParam(params, "horizonYears");
    if (horizonYears !== null) {
      setHorizon(Math.round(clamp(horizonYears, 1, 30)));
      applied = true;
    }

    const strategy = params.get("strategy");
    if (strategy && strategy in PRESETS) {
      applyPreset(strategy);
      applied = true;
    }

    const inflation = numberParam(params, "inflationPct");
    if (inflation !== null) {
      setInflationPct(clamp(inflation, 0, 100));
      applied = true;
    }

    const depreciation = numberParam(params, "egpDepreciationPct");
    if (depreciation !== null) {
      setDepreciationPct(clamp(depreciation, 0, 100));
      applied = true;
    }

    if (applied) {
      appliedPrefillRef.current = prefillQuery;
      const focus = params.get("focus");
      if (focus) {
        window.setTimeout(() => {
          document.querySelector(`[data-guide="${focus}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, [applyPreset, prefillQuery, setCapitalIdx, setDepreciationPct, setHorizon, setInflationPct]);

  // ─── WebMCP: expose investment simulator to AI agents ──────────────────────
  const investSchema = useMemo(() => ({
    type: "object" as const,
    properties: {
      capitalEgp: {
        type: "number",
        description: "Investment capital in EGP. Accepted values: 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000.",
      },
      horizonYears: {
        type: "number",
        description: "Investment time horizon in years (1-30)",
        minimum: 1,
        maximum: 30,
      },
      strategy: {
        type: "string",
        enum: Object.keys(PRESETS),
        description: "Predefined allocation strategy: conservative, balanced, aggressive, fixedIncome, or egyptianGrowth",
      },
      inflationPct: {
        type: "number",
        description: "Expected annual inflation rate % (default: 12)",
        minimum: 0,
      },
      egpDepreciationPct: {
        type: "number",
        description: "Expected annual EGP depreciation vs USD % (default: 7)",
        minimum: 0,
      },
    },
    required: [],
  }), []);

  useWebMCPTool({
    name: "simulate_egypt_investment",
    description: "Simulate investment portfolio returns in Egypt. Supports Egyptian stocks (EGX 30), bank certificates (Banque Misr, NBE, CIB), treasury bills, savings certificates, real estate, gold, and international indices (S&P 500, MSCI EM). Shows nominal, inflation-adjusted (real), and USD-equivalent projections over the chosen time horizon.",
    title: "Egypt Investment Simulator",
    inputSchema: investSchema,
    execute: useCallback((input: Record<string, unknown>) => {
      // Apply strategy preset if specified
      if (input.strategy && PRESETS[input.strategy as string]) {
        applyPreset(input.strategy as string);
      }

      // Apply capital
      if (input.capitalEgp) {
        const target = Number(input.capitalEgp);
        setCapitalIdx(closestCapitalIndex(target));
      }

      // Apply horizon
      if (input.horizonYears) setHorizon(Number(input.horizonYears));
      if (input.inflationPct !== undefined) setInflationPct(Number(input.inflationPct));
      if (input.egpDepreciationPct !== undefined) setDepreciationPct(Number(input.egpDepreciationPct));

      // Compute projections with current state
      const cap = input.capitalEgp
        ? CAPITAL_STEPS.reduce((prev, curr) => Math.abs(curr - Number(input.capitalEgp)) < Math.abs(prev - Number(input.capitalEgp)) ? curr : prev)
        : capital;
      const hor = Number(input.horizonYears) || horizon;
      const inf = input.inflationPct !== undefined ? Number(input.inflationPct) : inflation;
      const dep = input.egpDepreciationPct !== undefined ? Number(input.egpDepreciationPct) : depreciationPct;

      const alloc = input.strategy && PRESETS[input.strategy as string]
        ? { ...Object.fromEntries(ALL_ASSETS.map((a) => [a.key, 0])), ...PRESETS[input.strategy as string].allocation }
        : allocation;

      const proj = projectPortfolio(cap, hor, alloc, effectiveReturns, inf, exchangeRate, dep);
      const final = proj[proj.length - 1];

      return mcpJSON({
        capitalEgp: cap,
        horizonYears: hor,
        strategy: input.strategy || activePreset,
        inflationPct: inf,
        egpDepreciationPct: dep,
        currency: "EGP",
        results: {
          nominalFinalEgp: Math.round(final?.total ?? cap),
          realFinalEgp: Math.round(final?.real ?? cap),
          usdFinalValue: Math.round(final?.usdTotal ?? 0),
          nominalReturnPct: Number(((((final?.total ?? cap) - cap) / cap) * 100).toFixed(1)),
          realReturnPct: Number(((((final?.real ?? cap) - cap) / cap) * 100).toFixed(1)),
        },
        allocation: Object.entries(alloc)
          .filter(([, pct]) => pct > 0)
          .map(([key, pct]) => {
            const asset = ALL_ASSETS.find((a) => a.key === key);
            return {
              asset: key,
              name: asset?.nameEn ?? key,
              allocationPct: pct,
              annualReturnPct: effectiveReturns[key] ?? 0,
            };
          }),
        yearByYear: proj.map((p) => ({
          year: p.year,
          nominalEgp: Math.round(p.total),
          realEgp: Math.round(p.real),
          usdValue: Math.round(p.usdTotal),
        })),
      });
    }, [capital, horizon, allocation, effectiveReturns, inflation, exchangeRate,
        depreciationPct, activePreset, applyPreset, setCapitalIdx, setHorizon,
        setInflationPct, setDepreciationPct]),
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-content" dir={dir}>
      <div className="container-page">

        <DesktopNotice />

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">
            {t.invest_sectionLabel}
          </p>
          <h1 className="text-3xl md:text-4xl font-black mb-2">
            {t.invest_title}
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            {t.invest_subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 xl:items-start">

          {/* ─── Config Column (1 col) — sticky on desktop ─────────────── */}
          <div className="xl:col-span-1 xl:sticky xl:top-16 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto xl:scrollbar-thin space-y-5">

            {/* Capital */}
            <Card data-guide="capital" className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    {t.invest_capital}
                  </p>
                  <InputTooltip text={t.invest_capitalTooltip} />
                </div>
                <div className="text-center">
                  <div className="flex items-baseline justify-center gap-1" dir="ltr">
                    <input
                      name="invest-capital"
                      type="text"
                      inputMode="numeric"
                      defaultValue={fmtNumber(capital)}
                      key={capitalIdx}
                      onBlur={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const num = parseInt(raw) || 0;
                        const clamped = Math.max(50_000, Math.min(50_000_000, num));
                        let closest = 0;
                        for (let i = 0; i < CAPITAL_STEPS.length; i++) {
                          if (Math.abs(CAPITAL_STEPS[i] - clamped) < Math.abs(CAPITAL_STEPS[closest] - clamped)) closest = i;
                        }
                        setCapitalIdx(closest);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="text-2xl font-black text-foreground font-mono bg-transparent border-none outline-none text-center w-44 hover:ring-1 hover:ring-primary/20 focus:ring-1 focus:ring-primary/40 rounded px-2 py-1 transition-all cursor-text"
                      placeholder="1,000,000"
                    />
                    <span className="text-sm text-muted-foreground">EGP</span>
                  </div>
                  <p className="text-[0.6rem] text-muted-foreground/40 mt-1">
                    {t.invest_clickToType}
                  </p>
                </div>
                <Slider
                  dir="ltr"
                  min={0}
                  max={CAPITAL_STEPS.length - 1}
                  step={1}
                  value={[capitalIdx]}
                  onValueChange={([v]) => setCapitalIdx(v)}
                />
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {QUICK_CAPITALS.map((v) => {
                    const idx = CAPITAL_STEPS.indexOf(v);
                    return (
                      <button
                        key={v}
                        onClick={() => setCapitalIdx(idx)}
                        className={`text-[0.625rem] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                          capitalIdx === idx
                            ? "border-primary text-primary"
                            : "border-border hover:border-primary/50 hover:text-primary text-muted-foreground"
                        }`}
                      >
                        {fmtCompact(v)}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Horizon */}
            <Card data-guide="horizon" className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {t.invest_timeHorizon}
                    </p>
                    <InputTooltip text={t.invest_timeHorizonTooltip} />
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {horizon} {t.common_yr}
                  </Badge>
                </div>
                <AdjustableSlider
                  value={horizon}
                  onChange={(v) => setHorizon(v)}
                  defaultMin={1}
                  defaultMax={30}
                  step={1}
                  accentColor="#C9A84C"
                  formatLabel={(v) => `${v}yr`}
                />
              </CardContent>
            </Card>

            {/* Presets */}
            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  {t.invest_quickPresets}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      className={`text-[0.65rem] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                        activePreset === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isAr ? preset.nameAr : preset.nameEn}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Allocation sliders */}
            <Card data-guide="allocation" className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    {t.invest_allocation}
                  </p>
                  {!isValid ? (
                    <Badge className="text-[0.6rem] bg-red-500/20 text-red-400 border-red-500/30">
                      {totalAllocation}% / 100%
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[0.6rem] text-green-400">
                      100% ✓
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {ASSET_GROUPS.map((group) => {
                    const groupTotal = group.assets.reduce((s, a) => s + (allocation[a.key] ?? 0), 0);
                    const isExpanded = expandedGroups.has(group.key);
                    return (
                      <div key={group.key} className="rounded-lg border border-border/50 overflow-hidden">
                        {/* Group header */}
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 transition-colors"
                          style={{ borderInlineStart: `3px solid ${group.color}` }}
                        >
                          {isExpanded
                            ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                            : <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                          }
                          <span className="text-sm font-bold text-foreground flex-1 text-start">
                            {isAr ? group.nameAr : group.nameEn}
                          </span>
                          <span
                            className="text-xs font-mono font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${group.color}18`, color: group.color }}
                          >
                            {groupTotal}%
                          </span>
                        </button>

                        {/* Asset rows */}
                        {isExpanded && (
                          <div className="border-t border-border/30 divide-y divide-border/20">
                            {group.assets.map((asset) => {
                              const pct = allocation[asset.key] ?? 0;
                              const convexRec = convexDefaults?.[asset.convexKey];
                              const rate = (convexRec?.value !== undefined && convexRec.value <= 100)
                                ? convexRec.value
                                : asset.defaultReturn;
                              const tipTexts = ASSET_TOOLTIPS[asset.key];
                              return (
                                <div key={asset.key} className="px-3 py-2.5">
                                  {/* Row 1: Name + return rate */}
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[0.8rem] font-medium text-foreground">
                                        {isAr ? asset.nameAr : asset.nameEn}
                                      </span>
                                      {tipTexts && <InputTooltip text={isAr ? tipTexts.ar : tipTexts.en} />}
                                      {convexRec && <SanadBadge sanadLevel={convexRec.sanadLevel} sourceUrl={convexRec.sourceUrl} />}
                                    </div>
                                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                                      {(yieldOverrides[asset.key] ?? 0) > 0
                                        ? `${rate.toFixed(1)}% (${(rate - (yieldOverrides[asset.key] ?? 0)).toFixed(0)}+${(yieldOverrides[asset.key] ?? 0).toFixed(0)})`
                                        : `${rate.toFixed(1)}%`}
                                    </span>
                                  </div>
                                  {/* Row 2: Slider + allocation input */}
                                  <div className="flex items-center gap-2" dir="ltr">
                                    <Slider
                                      min={0} max={100} step={1}
                                      value={[pct]}
                                      onValueChange={([v]) => handleAllocationChange(asset.key, v)}
                                      className="flex-1"
                                    />
                                    <div className="flex items-center shrink-0">
                                      <input
                                        name={`alloc-${asset.key}`}
                                        type="number" min={0} max={100}
                                        value={pct}
                                        onChange={(e) => handleAllocationChange(asset.key, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                        className="w-12 text-center font-mono text-sm font-bold border border-border/60 rounded-md px-1 py-0.5 bg-muted/20 focus:ring-1 focus:ring-primary/40 focus:outline-none"
                                      />
                                      <span className="text-xs text-muted-foreground ms-0.5">%</span>
                                    </div>
                                  </div>
                                  {/* Row 3: Yield input OR pure-income label */}
                                  {asset.yieldPct !== undefined ? (
                                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/10">
                                      <span className="text-[0.65rem] text-muted-foreground">
                                        {(isAr ? asset.yieldLabelAr : asset.yieldLabelEn) ?? t.invest_incomeYield}
                                      </span>
                                      <div className="flex items-center gap-1" dir="ltr">
                                        <input
                                          name={`yield-${asset.key}`}
                                          type="number" min={0} max={20} step={0.5}
                                          value={yieldOverrides[asset.key] ?? 0}
                                          onChange={(e) => handleYieldChange(asset.key, Math.min(20, Math.max(0, parseFloat(e.target.value) || 0)))}
                                          className="w-12 text-center font-mono text-xs border border-border/60 rounded px-1 py-0.5 bg-muted/20 focus:ring-1 focus:ring-primary/40 focus:outline-none"
                                        />
                                        <span className="text-[0.6rem] text-muted-foreground">%</span>
                                      </div>
                                    </div>
                                  ) : (group.key === "bank_cds" || group.key === "gov_fixed_income") ? (
                                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/10">
                                      <span className="text-[0.6rem] text-muted-foreground/60">
                                        {t.invest_fixedIncomeNote}
                                      </span>
                                      {convexRec?.sourceUrl && (
                                        <a href={convexRec.sourceUrl} target="_blank" rel="noopener noreferrer"
                                          className="text-[0.6rem] text-primary/50 hover:text-primary no-underline font-mono">
                                          {t.common_source} ↗
                                        </a>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!isValid && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                    <p className="text-[0.65rem] text-red-400">
                      {t.invest_allocationWarning} {totalAllocation}% / 100%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Risk Meter */}
            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  {t.invest_riskLevel}
                </p>
                <div dir="ltr">
                  <div className="h-3 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 relative">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-foreground shadow-lg transition-all duration-500"
                      style={{ left: `${Math.min(riskScore * 4, 96)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[0.6rem] text-muted-foreground mt-1">
                    <span>{t.invest_safe}</span>
                    <span>{t.invest_highRisk}</span>
                  </div>
                </div>
                <p className="text-[0.65rem] text-muted-foreground text-center">
                  {t.invest_weightedVolatility}{" "}
                  <span className="font-mono text-foreground">{riskScore.toFixed(1)}%</span>
                </p>
              </CardContent>
            </Card>

            {/* Inflation + Depreciation */}
            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5 space-y-5">
                {/* Inflation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t.invest_inflationYr}
                      </p>
                      <InputTooltip text={t.invest_inflationTooltip} />
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {inflationPct}%
                    </Badge>
                  </div>
                  <AdjustableSlider
                    value={inflationPct}
                    onChange={(v) => setInflationPct(v)}
                    defaultMin={2}
                    defaultMax={40}
                    step={1}
                    accentColor="#C9A84C"
                    formatLabel={(v) => `${v}%`}
                  />
                </div>

                <Separator />

                {/* Depreciation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t.invest_depreciationYr}
                      </p>
                      <InputTooltip text={t.invest_depreciationTooltip} />
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {depreciationPct}%
                    </Badge>
                  </div>
                  <AdjustableSlider
                    value={depreciationPct}
                    onChange={(v) => setDepreciationPct(v)}
                    defaultMin={0}
                    defaultMax={30}
                    step={1}
                    accentColor="#C9A84C"
                    formatLabel={(v) => `${v}%`}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Results Columns (3 cols) ───────────────────────────────── */}
          <div className="xl:col-span-3 space-y-6 min-w-0">

            {/* Hero Result — sticky on mobile so users see changes while adjusting controls */}
            <motion.div
              className="xl:static"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card/80 to-card/60 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {t.invest_projectedValue}
                    </p>
                    <p className="text-xs text-muted-foreground ms-auto">
                      {t.invest_inYears} {horizon} {t.common_yr} — {t.invest_from} {fmtVal(capital)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" dir="ltr">
                    {/* Nominal */}
                    <div className="text-start">
                      <div className="flex items-center gap-1 mb-1">
                        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                          {t.invest_nominal}
                        </p>
                        <InputTooltip text={t.invest_nominalTooltip} />
                      </div>
                      <motion.p
                        key={finalValue}
                        initial={{ opacity: 0.5, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-2xl font-black text-primary font-mono"
                      >
                        {fmtVal(finalValue)}
                      </motion.p>
                      <p className="text-[0.6rem] text-muted-foreground/60 mt-1">
                        {finalValue > 0
                          ? `${(finalValue / capital).toFixed(1)}x ${t.invest_growthNote}`
                          : "—"}
                      </p>
                    </div>

                    {/* Real (inflation-adjusted) */}
                    <div className="text-start">
                      <div className="flex items-center gap-1 mb-1">
                        <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                          {t.invest_purchasingPower}
                        </p>
                        <InputTooltip text={`${t.invest_purchasingPowerTooltip} (${Math.round(inflation)}%, ~${(Math.log(2) / Math.log(1 + inflation / 100)).toFixed(0)} ${t.common_yr})`} />
                      </div>
                      <p className="text-2xl font-black text-foreground font-mono">
                        {fmtVal(finalReal)}
                      </p>
                      <p className="text-[0.6rem] text-muted-foreground/60 mt-1">
                        {t.invest_todaysEgp} ({Math.round(inflation)}% {t.invest_inflationLabel})
                      </p>
                    </div>

                    {/* USD equivalent — always shown as comparison */}
                    {exchangeRate > 0 && (
                      <div className="text-start">
                        <div className="flex items-center gap-1 mb-1">
                          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                            {t.invest_inUsd}
                          </p>
                          <InputTooltip text={`${t.invest_inUsdTooltip} (${exchangeRate.toFixed(1)} EGP/$, ${depreciationPct}%)`} />
                        </div>
                        <motion.p
                          key={`usd-${finalUsd}-${depreciationPct}`}
                          initial={{ opacity: 0.5 }}
                          animate={{ opacity: 1 }}
                          className="text-2xl font-black text-foreground font-mono"
                        >
                          ${fmtCompact(finalUsd)}
                        </motion.p>
                        <p className="text-[0.6rem] text-muted-foreground/60 mt-1">
                          {t.invest_atProjectedRate} ({depreciationPct}%/{t.common_yr})
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Stacked Area Chart */}
            <Card data-guide="output" className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    {t.invest_portfolioGrowth}
                  </p>
                </div>
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={380}>
                    <AreaChart data={stackedData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <defs>
                        {ALL_ASSETS.map((asset) => (
                          <linearGradient key={asset.key} id={`grad-${asset.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={asset.groupColor} stopOpacity={0.6} />
                            <stop offset="95%" stopColor={asset.groupColor} stopOpacity={0.05} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 10, fill: "#888" }}
                        tickFormatter={(v: number) => `Y${v}`}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#888" }}
                        tickFormatter={(v: number) => fmtCompact(v)}
                        stroke="rgba(255,255,255,0.1)"
                        width={60}
                      />
                      <Tooltip
                        content={(props) => (
                          <DarkTooltip
                            active={props.active}
                            payload={props.payload as unknown as readonly TooltipPayloadItem[] | undefined}
                            label={props.label as string | undefined}
                            isAr={isAr}
                            yearLabel={t.invest_year}
                            totalLabel={t.invest_total}
                          />
                        )}
                      />
                      {ALL_ASSETS.map((asset) => {
                        const pct = allocation[asset.key] ?? 0;
                        if (pct === 0) return null;
                        return (
                          <Area
                            key={asset.key}
                            type="monotone"
                            dataKey={asset.key}
                            name={isAr ? asset.nameAr : asset.nameEn}
                            stackId="portfolio"
                            stroke={asset.groupColor}
                            fill={`url(#grad-${asset.key})`}
                            strokeWidth={1.5}
                            animationDuration={2000}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Asset Race Chart */}
            <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {t.invest_assetRace}
                </p>
                <p className="text-[0.7rem] text-muted-foreground mb-4">
                  {t.invest_assetRaceDesc} {fmtVal(capital)}
                </p>
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={raceData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 10, fill: "#888" }}
                        tickFormatter={(v: number) => `Y${v}`}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#888" }}
                        tickFormatter={(v: number) => fmtCompact(v)}
                        stroke="rgba(255,255,255,0.1)"
                        width={60}
                      />
                      <Tooltip
                        content={(props) => (
                          <RaceTooltip
                            active={props.active}
                            payload={props.payload as unknown as readonly TooltipPayloadItem[] | undefined}
                            label={props.label as string | undefined}
                            isAr={isAr}
                            yearLabel={t.invest_year}
                          />
                        )}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 10, color: "#888" }}
                        formatter={(value: string) => <span style={{ color: "#888", fontSize: 10 }}>{value}</span>}
                      />
                      {RACE_ASSETS.map((asset) => (
                        <Line
                          key={asset.key}
                          type="monotone"
                          dataKey={asset.key}
                          name={isAr ? asset.nameAr : asset.nameEn}
                          stroke={asset.color}
                          strokeWidth={2}
                          dot={false}
                          animationDuration={1500}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Comparison Cards */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                {t.invest_assetBreakdown}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {ALL_ASSETS.filter((asset) => (allocation[asset.key] ?? 0) > 0).map((asset, i) => {
                  const pct = allocation[asset.key] ?? 0;
                  const rate = effectiveReturns[asset.key] ?? asset.defaultReturn;
                  const finalAssetValue = projections[projections.length - 1]?.byAsset[asset.key] ?? 0;
                  const convexRec = convexDefaults?.[asset.convexKey];
                  return (
                    <motion.div
                      key={asset.key}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.4 }}
                    >
                      <Card
                        className="border-border/60 bg-card/60 transition-all duration-300"
                        style={{ borderColor: `${asset.groupColor}33` }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: asset.groupColor }} />
                            <span className="text-[0.65rem] text-muted-foreground leading-tight truncate">
                              {isAr ? asset.nameAr : asset.nameEn}
                            </span>
                            {convexRec && (
                              <SanadBadge
                                sanadLevel={convexRec.sanadLevel}
                                sourceUrl={convexRec.sourceUrl}
                              />
                            )}
                          </div>
                          <p
                            className="text-lg font-black font-mono leading-tight"
                            style={{ color: asset.groupColor }}
                          >
                            {fmtVal(finalAssetValue)}
                          </p>
                          <p className="text-[0.6rem] text-muted-foreground">
                            EGP / {horizon}{t.common_yearSuffix}
                          </p>
                          <p className="text-[0.58rem] text-muted-foreground/60 font-mono" dir="ltr">
                            ≈ ${fmtCompact(finalAssetValue / (exchangeRate * Math.pow(1 + depreciationPct / 100, horizon)))} USD
                          </p>
                          <Separator className="my-2" />
                          <div className="flex justify-between text-[0.6rem]">
                            <span className="text-muted-foreground">{t.invest_alloc}</span>
                            <span className="font-mono text-foreground">{pct}%</span>
                          </div>
                          <div className="flex justify-between text-[0.6rem]">
                            <span className="text-muted-foreground">{t.invest_return}</span>
                            <span className="font-mono" style={{ color: asset.groupColor }}>{rate.toFixed(1)}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Inflation Warning */}
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground mb-1">
                      {t.invest_cashWarningTitle}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t.invest_cashWarningDesc} {inflation.toFixed(1)}%: {fmtVal(capital)} → {fmtVal(cashFinalValue)} ({horizon} {t.common_yr}) — {t.invest_loss} {fmtVal(capital - cashFinalValue)}
                    </p>
                    <div className="mt-3 flex items-center gap-3" dir="ltr">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-yellow-400/70 rounded-full transition-all duration-700"
                          style={{ width: `${(cashFinalValue / capital) * 100}%` }}
                        />
                      </div>
                      <span className="text-[0.65rem] font-mono text-yellow-400 whitespace-nowrap">
                        {((cashFinalValue / capital) * 100).toFixed(1)}% {t.invest_remains}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Currency Warning */}
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground mb-1">
                      {t.invest_currencyNote}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t.invest_currencyNoteDesc}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/40">
              <Info size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-[0.65rem] text-muted-foreground leading-relaxed">
                {t.invest_disclaimer}
              </p>
            </div>

            {/* Methodology Section */}
            <div className="mt-10 border-t border-border pt-8">
              <button
                onClick={() => setShowMethodology((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors group"
              >
                <BookOpen size={14} />
                <span>{t.invest_methodologyTitle}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${showMethodology ? "rotate-180" : ""}`}
                />
              </button>

              {showMethodology && (
                <div className="mt-4 space-y-5 text-xs text-muted-foreground leading-relaxed">

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_projectionFormula}
                    </h4>
                    <p className="font-mono text-[0.7rem] bg-muted/30 p-2 rounded">FV = PV × (1 + r)^n</p>
                    <p className="mt-1">{t.invest_portfolioFormula}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_inflationAdjustment}
                    </h4>
                    <p className="font-mono text-[0.7rem] bg-muted/30 p-2 rounded">Real value = Nominal / (1 + inflation)^year</p>
                    <p className="mt-1">{t.invest_inflationAdjustmentDesc}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_riskScoreTitle}
                    </h4>
                    <p>{t.invest_riskScoreDesc}</p>
                    <p className="mt-1">{t.invest_riskScoreScale}</p>
                    <p className="mt-1 font-mono text-[0.65rem] bg-muted/30 p-2 rounded leading-loose">
                      Bank CDs 1-2% · Gov Certs 1% · T-bills 3% · Real Estate 12% · S&P 500 15% · Gold 18% · MSCI EM 20% · EGX 30 25%
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_currencyConsiderations}
                    </h4>
                    <p>{t.invest_currencyConsiderationsP1}</p>
                    <p className="mt-1">{t.invest_currencyConsiderationsP2}</p>
                    <p className="mt-1">{t.invest_currencyConsiderationsP3}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_returnRateSources}
                    </h4>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>{t.invest_sourceEgx30}</li>
                      <li>{t.invest_sourceRealEstate}</li>
                      <li>{t.invest_sourceBankCerts}</li>
                      <li>{t.invest_sourceTbills}</li>
                      <li>{t.invest_sourceGovCerts}</li>
                      <li>{t.invest_sourceGold}</li>
                      <li>{t.invest_sourceSp500}</li>
                      <li>{t.invest_sourceMsciEm}</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.invest_keyAssumptions}
                    </h4>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>{t.invest_assumptionCompound}</li>
                      <li>{t.invest_assumptionNoCosts}</li>
                      <li>{t.invest_assumptionPastPerf}</li>
                      <li>{t.invest_assumptionNoRebalance}</li>
                      <li>{t.invest_assumptionNominal}</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                    <h4 className="font-semibold text-foreground mb-1">
                      {t.common_disclaimer}
                    </h4>
                    <p>{t.invest_disclaimerFull}</p>
                  </div>
                </div>
              )}
            </div>

            <DataSourceFooter category="economy" />
          </div>
        </div>
      </div>
    </div>
  );
}
