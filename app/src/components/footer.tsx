"use client";

import Link from "next/link";
import { Scale, ExternalLink, Github } from "lucide-react";
import { useLanguage } from "@/components/providers";
import { NAV_GROUPS } from "@/lib/navigation";
import pkg from "../../package.json";

const APP_VERSION = pkg.version;

const srcs = [
  { name: "parliament.gov.eg", url: "https://www.parliament.gov.eg" },
  { name: "mof.gov.eg", url: "https://www.mof.gov.eg" },
  { name: "cbe.org.eg", url: "https://www.cbe.org.eg" },
  { name: "worldbank.org", url: "https://data.worldbank.org/country/egypt-arab-rep" },
  { name: "imf.org", url: "https://www.imf.org/en/Countries/EGY" },
];

const NavColumn = ({ title, items, isAr }: { title: string; items: Array<{ href: string; ar: string; en: string }>; isAr: boolean }) => (
  <div>
    <h4 className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h4>
    <nav className="flex flex-col gap-1.5">
      {items.map((l) => <Link key={l.href} href={l.href} className="text-sm text-muted-foreground no-underline hover:text-primary transition-colors">{isAr ? l.ar : l.en}</Link>)}
    </nav>
  </div>
);

export function Footer() {
  const { t, lang, dir } = useLanguage();
  const isAr = lang === "ar";


  return (
    <footer className="container-page border-t border-border" dir={dir}>
      <div className="py-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
        {/* Brand */}
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-primary text-primary-foreground flex items-center justify-center"><Scale size={10} strokeWidth={2} /></div>
            <span className="font-bold text-sm">{t.siteName}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mb-3">
            {t.footer_description}
          </p>
          <a href="https://github.com/bokralabs/mizan" target="_blank" rel="noopener noreferrer"
            className="text-xs text-muted-foreground no-underline hover:text-primary transition-colors inline-flex items-center gap-1.5">
            <Github size={14} /> GitHub
          </a>
        </div>

        {/* Nav columns — from shared navigation config */}
        {NAV_GROUPS.map((group) => (
          <NavColumn key={group.en} title={isAr ? group.ar : group.en} items={group.items} isAr={isAr} />
        ))}

        {/* Sources */}
        <div>
          <h4 className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t.footer_sources}</h4>
          <nav className="flex flex-col gap-1.5">
            {srcs.map((s) => <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground no-underline hover:text-primary transition-colors inline-flex items-center gap-1">{s.name} <ExternalLink size={10} /></a>)}
          </nav>
        </div>
      </div>
      <div className="py-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t.footer_tagline}{" "}
          Build by{" "}
          <a href="https://bokralabs.com" target="_blank" rel="noopener noreferrer" className="text-primary no-underline hover:underline">bokralabs.com</a>
        </p>
        <div className="flex items-center gap-3">
          <a
            href={`https://github.com/bokralabs/mizan/releases/tag/${process.env.NEXT_PUBLIC_APP_VERSION || "v1.0.2"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.625rem] text-muted-foreground/60 no-underline hover:text-primary font-mono transition-colors"
          >
            v{APP_VERSION}
          </a>
          <p className="text-xs text-muted-foreground font-mono">© {new Date().getFullYear()}</p>
        </div>
      </div>
    </footer>
  );
}
