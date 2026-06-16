"use client";

import {
  ExternalLink,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  GitBranch,
  Shield,
  RefreshCw,
  Search,
  ThumbsUp,
  Database,
} from "lucide-react";
import { useLanguage } from "@/components/providers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MethodologyPage() {
  const { t, lang, dir } = useLanguage();
  const isAr = lang === "ar";

  return (
    <div className="page-content" dir={dir}>
      <div className="container-page">

        {/* ════════ PAGE HEADER ════════ */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Shield size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest">
                {t.navMethodology}
              </p>
              <h1 className="text-2xl md:text-3xl font-black">
                {t.methodology_title}
              </h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {t.methodology_desc}
          </p>
        </div>

        {/* ════════ SECTION 1: AI DATA AGENT ════════ */}
        <section className="mb-14" id="ai-agent">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={16} className="text-primary" />
            <h2 className="text-base font-bold uppercase tracking-widest text-primary">
              {t.methodology_aiAgentHeading}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-xl">
            {t.methodology_aiAgentDesc}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: RefreshCw,
                titleAr: "كل ٦ ساعات",
                titleEn: "Every 6 Hours",
                descAr: "وكيل ذكاء اصطناعي يفحص المصادر الرسمية تلقائياً عبر Convex cron job.",
                descEn: "AI agent automatically checks official government sources via Convex cron job.",
              },
              {
                icon: Search,
                titleAr: "تحليل بالذكاء الاصطناعي",
                titleEn: "AI Parsing",
                descAr: "يستخدم Claude AI لاستخراج البيانات من مواقع الحكومة وملفات PDF الرسمية.",
                descEn: "Uses Claude AI to extract data from government websites and official PDFs.",
              },
              {
                icon: Shield,
                titleAr: "تحقق تقاطعي",
                titleEn: "Cross-Validation",
                descAr: "كل بيان يُطابق مع مصادر متعددة — لا يُعتمد مصدر واحد منفرداً.",
                descEn: "Each data point is cross-validated against multiple sources — never a single source.",
              },
              {
                icon: CheckCircle2,
                titleAr: "فحوصات حتمية",
                titleEn: "Deterministic Checks",
                descAr: "مجاميع الميزانية يجب أن تتطابق. عدد النواب يجب أن يتطابق. نسب الدين يجب أن تقع في النطاق المتوقع.",
                descEn: "Budget totals must sum. Member counts must match. Debt ratios must fall within expected ranges.",
              },
              {
                icon: Database,
                titleAr: "سجل تدقيق كامل",
                titleEn: "Full Audit Trail",
                descAr: "كل تغيير موثق بالمصدر، القيمة القديمة، القيمة الجديدة، والطابع الزمني.",
                descEn: "Every change logged with source URL, old value, new value, and timestamp.",
              },
              {
                icon: AlertTriangle,
                titleAr: "تحقق آلي للتغييرات الحكومية",
                titleEn: "AI Verification for Gov Changes",
                descAr: "التغييرات الوزارية يتم التحقق منها بالذكاء الاصطناعي ومقارنتها بمصادر متعددة. يتم إنشاء GitHub Issue تلقائياً عند وجود تعارض.",
                descEn: "Cabinet changes are AI-verified against multiple sources. A GitHub Issue is auto-created when discrepancies are found for community verification.",
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <Card key={i} className="border-border/60">
                  <CardContent className="p-5">
                    <Icon size={18} className="text-primary mb-3" />
                    <h3 className="text-sm font-bold mb-1">{isAr ? item.titleAr : item.titleEn}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isAr ? item.descAr : item.descEn}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock size={11} />
            {t.methodology_transparencyLink}
            {" "}
            <Link href="/transparency" className="text-primary no-underline hover:underline font-medium">
              {t.methodology_transparencyDashboard}
            </Link>
          </p>
        </section>

        <Separator className="mb-14" />

        {/* ════════ SECTION 2: PROPOSE CORRECTIONS ════════ */}
        <section className="mb-12" id="corrections">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp size={16} className="text-primary" />
            <h2 className="text-base font-bold uppercase tracking-widest text-primary">
              {t.methodology_correctionsHeading}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-xl">
            {t.methodology_correctionsDesc}
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button asChild className="w-fit gap-2">
                <a
                  href="https://github.com/bokralabs/mizan/issues/new?template=data-issue.md&labels=data-correction"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitBranch size={14} />
                  {t.methodology_reportDataError}
                  <ExternalLink size={12} />
                </a>
              </Button>
              <Button asChild variant="outline" className="w-fit gap-2">
                <a
                  href="https://github.com/bokralabs/mizan/issues/new?template=bug-report.md&labels=bug"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AlertTriangle size={14} />
                  {t.methodology_reportBug}
                  <ExternalLink size={12} />
                </a>
              </Button>
              <Button asChild variant="outline" className="w-fit gap-2">
                <a
                  href="https://github.com/bokralabs/mizan/issues/new?template=feature-request.md&labels=enhancement"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ThumbsUp size={14} />
                  {t.methodology_requestFeature}
                  <ExternalLink size={12} />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground max-w-lg">
              {t.methodology_reviewNote}
            </p>
          </div>
        </section>

        <Separator className="mb-14" />

        {/* ════════ SECTION 3: SANAD REFERENCE CONFIDENCE ════════ */}
        <section className="mb-12" id="sanad">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-primary" />
            <h2 className="text-base font-bold uppercase tracking-widest text-primary">
              {t.methodology_sanadHeading}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-xl">
            {t.methodology_sanadDesc}
          </p>

          <div className="space-y-1.5 mb-6">
            {[
              { level: "✓", labelAr: "إجماع", labelEn: "Consensus", descAr: "مصادر متعددة تتفق على نفس القيمة — أعلى مستوى ثقة (مرجّح بوزن السند)", descEn: "Multiple sources agree — highest confidence (weighted by Sanad level)", dot: "bg-teal-500", textColor: "text-teal-600 dark:text-teal-400" },
              { level: "1", labelAr: "حكومي رسمي", labelEn: "Official Government", descAr: "مباشر من مصادر حكومية رسمية (.gov.eg) — الجهاز المركزي للإحصاء، الوزارات", descEn: "Direct from gov.eg sources — CAPMAS, ministries", dot: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
              { level: "2", labelAr: "منظمة دولية", labelEn: "International Org", descAr: "البنك الدولي، صندوق النقد الدولي، برنامج الأمم المتحدة الإنمائي", descEn: "World Bank, IMF, UNDP", dot: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400" },
              { level: "3", labelAr: "إعلام", labelEn: "News & Media", descAr: "الأهرام، الهيئة العامة للاستعلامات، إيجيبت توداي", descEn: "Ahram Online, SIS, EgyptToday", dot: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
              { level: "4", labelAr: "مصادر أخرى", labelEn: "Other Sources", descAr: "ويكيبيديا، بيانات مجتمعية", descEn: "Wikipedia, community-submitted", dot: "bg-muted-foreground", textColor: "text-muted-foreground" },
              { level: "5", labelAr: "محسوب", labelEn: "Derived/Calculated", descAr: "محسوب أو مشتق من بيانات أخرى", descEn: "Computed from other data", dot: "bg-violet-500", textColor: "text-violet-600 dark:text-violet-400" },
            ].map((lvl) => (
              <div
                key={lvl.level}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-4 py-2.5"
              >
                <span className="text-[0.65rem] font-mono text-muted-foreground/60 w-4 text-center shrink-0">
                  {lvl.level}
                </span>
                <span className={cn("w-2 h-2 rounded-full shrink-0", lvl.dot)} />
                <span className={cn("text-xs font-bold w-32 shrink-0", lvl.textColor)}>
                  {isAr ? lvl.labelAr : lvl.labelEn}
                </span>
                <span className="text-[0.65rem] text-muted-foreground">
                  {isAr ? lvl.descAr : lvl.descEn}
                </span>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
                  {t.methodology_transparencyNote}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t.methodology_transparencyNoteDesc}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  );
}
