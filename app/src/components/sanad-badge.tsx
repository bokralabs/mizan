"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SANAD_CONFIG } from "@/lib/sanad";
import { useLanguage } from "@/components/providers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SanadBadgeProps {
  sanadLevel: number;
  sourceUrl?: string;
  sourceNameEn?: string;
  sourceNameAr?: string;
  showLabel?: boolean;
  className?: string;
  focusable?: boolean;
}

export function SanadBadge({
  sanadLevel,
  sourceUrl,
  sourceNameEn,
  sourceNameAr,
  showLabel = false,
  className,
  focusable = true,
}: SanadBadgeProps) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const config = SANAD_CONFIG[sanadLevel] ?? SANAD_CONFIG[4];
  const description = isAr
    ? `مستوى سند ${sanadLevel}: ${config.labelAr}. يوضح درجة قرب المصدر من الجهة الأصلية وثقتنا في الرقم.`
    : `Sanad level ${sanadLevel}: ${config.labelEn}. Indicates source proximity and confidence for this datapoint.`;
  const sourceTitle = isAr ? (sourceNameAr ?? sourceNameEn) : (sourceNameEn ?? sourceNameAr);

  return (
    <span className={cn("inline-flex items-center gap-1 shrink-0", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={focusable ? 0 : undefined}
            aria-label={description}
            className="inline-flex cursor-help items-center gap-1 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
            {showLabel && (
              <span className="text-[0.55rem] text-muted-foreground">
                {isAr ? config.labelAr : config.labelEn}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 leading-5">
          {description}
        </TooltipContent>
      </Tooltip>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={sourceTitle}
          aria-label={isAr ? "افتح المصدر الأصلي" : "Open original source"}
          className="text-muted-foreground/40 transition-colors hover:text-primary"
        >
          <ExternalLink size={9} />
        </a>
      )}
    </span>
  );
}
