"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { useLanguage } from "@/components/providers";

type Headline = {
  title: string;
  url: string;
  sourceDomain: string;
  language: string;
  publishedAt: number;
};

const COPY = {
  en: {
    channel: "News channel",
    stories: "stories",
    loading: "Loading headlines",
    empty: "No news available",
    open: "Open",
  },
  ar: {
    channel: "قناة الأخبار",
    stories: "خبر",
    loading: "تحميل الأخبار",
    empty: "لا توجد أخبار حالياً",
    open: "فتح",
  },
} as const;

function relativeTime(epochMs: number, lang: "ar" | "en"): string {
  const diff = Math.max(0, Date.now() - epochMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "ar" ? "الآن" : "now";
  if (mins < 60) return lang === "ar" ? `منذ ${mins}د` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "ar" ? `منذ ${hrs}س` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === "ar" ? `منذ ${days}ي` : `${days}d ago`;
}

function headlineLanguageScore(headline: Headline, lang: "ar" | "en"): number {
  if (lang === "ar") return headline.language === "Arabic" ? 0 : 1;
  return headline.language === "English" ? 0 : 1;
}

export function NewsTicker() {
  const { lang, t } = useLanguage();
  const copy = COPY[lang];
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch("/api/news")
      .then((res) => res.json())
      .then((data: { articles?: Headline[] }) => {
        setHeadlines(data.articles ?? []);
      })
      .catch(() => setHeadlines([]))
      .finally(() => setLoading(false));
  }, []);

  const visibleHeadlines = useMemo(() => (
    [...headlines]
      .sort((a, b) => {
        const langDelta = headlineLanguageScore(a, lang) - headlineLanguageScore(b, lang);
        return langDelta !== 0 ? langDelta : b.publishedAt - a.publishedAt;
      })
      .slice(0, 18)
  ), [headlines, lang]);

  function renderTickerItem(headline: Headline, index: number, interactive: boolean) {
    const meta = `${headline.sourceDomain} · ${relativeTime(headline.publishedAt, lang)}`;
    const content = (
      <>
        <span className="mx-3 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
        <span className="max-w-32 shrink-0 truncate font-mono text-[0.62rem] uppercase text-primary/75">
          {meta}
        </span>
        <span className="mx-2 text-muted-foreground/45">/</span>
        <span className="max-w-[34rem] truncate text-xs font-semibold text-foreground">
          {headline.title}
        </span>
      </>
    );

    if (!interactive) {
      return (
        <span key={`dup-${headline.url}-${index}`} className="inline-flex h-full shrink-0 items-center whitespace-nowrap" aria-hidden="true">
          {content}
          <span className="ms-1 inline-flex size-10 shrink-0" />
        </span>
      );
    }

    return (
      <span key={`${headline.url}-${index}`} className="group/news-item inline-flex h-full shrink-0 items-center whitespace-nowrap">
        <a
          href={headline.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 min-w-0 items-center text-start text-foreground no-underline outline-none transition-colors hover:text-primary focus-visible:text-primary"
        >
          {content}
        </a>
        <a
          href={headline.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${copy.open}: ${headline.title}`}
          className="ms-1 inline-flex size-10 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground opacity-60 no-underline transition-colors hover:bg-primary/10 hover:text-primary hover:opacity-100 focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:opacity-100"
        >
          <ExternalLink size={12} />
        </a>
      </span>
    );
  }

  if (!loading && visibleHeadlines.length === 0) {
    return (
      <section className="rounded-[8px] border border-border/70 bg-card/75 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Newspaper size={14} className="text-primary" />
          <span>{t.newsTicker_noNews ?? copy.empty}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[8px] border border-border/70 bg-card/75">
      <div className="flex min-h-12 items-center gap-3 overflow-hidden px-3">
        <div className="inline-flex shrink-0 items-center gap-2 text-primary">
          <Newspaper size={14} />
          <span className="workbench-label">{t.newsTicker_title ?? copy.channel}</span>
        </div>
        <div className="h-5 w-px shrink-0 bg-border/80" />
        <div className="news-marquee min-w-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
          ) : (
            <div className={lang === "ar" ? "news-marquee-track news-marquee-track-rtl" : "news-marquee-track"}>
              {visibleHeadlines.map((headline, index) => renderTickerItem(headline, index, true))}
              {visibleHeadlines.map((headline, index) => renderTickerItem(headline, index, false))}
            </div>
          )}
        </div>
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
          {loading ? copy.loading : `${visibleHeadlines.length} ${t.newsTicker_stories ?? copy.stories}`}
        </span>
      </div>

    </section>
  );
}
