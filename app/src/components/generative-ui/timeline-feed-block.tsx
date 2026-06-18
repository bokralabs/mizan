import { AlertCircle, CalendarClock, CircleCheckBig, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlockFrame, SourceRail, getSourceById } from "@/components/generative-ui/block-frame";
import { cn } from "@/lib/utils";
import type { TimelineFeedBlockData } from "@/components/generative-ui/types";

const impactTone = {
  high: {
    icon: AlertCircle,
    className: "border-rose-600/40 bg-rose-500/10 text-rose-700",
    label: "High impact",
  },
  medium: {
    icon: Radar,
    className: "border-amber-600/40 bg-amber-500/10 text-amber-700",
    label: "Medium impact",
  },
  low: {
    icon: CircleCheckBig,
    className: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700",
    label: "Low impact",
  },
} as const;

export function TimelineFeedBlock({
  eyebrow,
  heading,
  summary,
  signals,
  sources,
  footerNote,
}: TimelineFeedBlockData) {
  return (
    <BlockFrame
      eyebrow={eyebrow}
      heading={heading}
      summary={summary}
      footerNote={footerNote}
    >
      <div className="space-y-3">
        {signals.map((signal) => {
          const impact = impactTone[signal.impact];
          const source = getSourceById(sources, signal.sourceId);
          const Icon = impact.icon;

          return (
            <article
              key={signal.id}
              className="workbench-tile grid min-w-0 gap-3 rounded-[9px] border border-border/70 bg-background/60 p-3 lg:grid-cols-[minmax(0,128px)_minmax(0,1fr)]"
            >
              <div className="flex flex-wrap items-center gap-2 lg:block lg:space-y-2">
                <Badge
                  variant="outline"
                  className={cn("min-h-8 max-w-full gap-1.5 rounded-[6px] px-2 py-1 text-[0.68rem]", impact.className)}
                >
                  <Icon className="size-3" />
                  <span className="mizan-text-safe min-w-0">{impact.label}</span>
                </Badge>
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5 text-primary" />
                  <span>{signal.eventDate}</span>
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <h3 className="mizan-text-safe min-w-0 text-base font-semibold leading-6 text-foreground">
                    {signal.label}
                  </h3>
                  {source ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 max-w-full min-w-0 items-center justify-self-start rounded-[6px] border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs leading-4 text-primary hover:underline lg:justify-self-end"
                    >
                      <span className="mizan-text-safe min-w-0">{source.label}</span>
                    </a>
                  ) : null}
                </div>

                <p className="mizan-text-safe text-xs leading-5 text-muted-foreground">
                  {signal.summary}
                </p>

                <div className="flex flex-wrap gap-2">
                  {signal.evidence.map((item) => (
                    <span
                      key={item}
                      className="mizan-text-safe rounded-[6px] border border-border/70 bg-muted/70 px-2 py-1 text-[0.68rem] text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <SourceRail sources={sources} />
    </BlockFrame>
  );
}
