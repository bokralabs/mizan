import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlockFrame, SourceRail, getSourceById } from "@/components/generative-ui/block-frame";
import { cn } from "@/lib/utils";
import type { MetricDelta, MetricStripBlockData } from "@/components/generative-ui/types";

function DeltaBadge({ delta }: { delta: MetricDelta }) {
  const Icon =
    delta.direction === "up"
      ? TrendingUp
      : delta.direction === "down"
        ? TrendingDown
        : Minus;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-[6px] px-2 py-1 text-[11px]",
        delta.direction === "up" && "border-emerald-600/40 bg-emerald-500/10 text-emerald-700",
        delta.direction === "down" && "border-rose-600/40 bg-rose-500/10 text-rose-700",
        delta.direction === "flat" && "border-border/70 bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {delta.label}
    </Badge>
  );
}

export function MetricStripBlock({
  eyebrow,
  heading,
  summary,
  metrics,
  sources,
  footerNote,
}: MetricStripBlockData) {
  return (
    <BlockFrame
      eyebrow={eyebrow}
      heading={heading}
      summary={summary}
      footerNote={footerNote}
      className="metric-strip-shell"
    >
      <div className="metric-strip-grid">
        {metrics.map((metric) => {
          const source = getSourceById(sources, metric.sourceId);

          return (
            <article
              key={metric.id}
              className={cn(
                "workbench-tile min-w-0 rounded-[9px] border border-border/70 bg-background/60 p-3",
                metric.emphasis === "primary" &&
                  "border-primary bg-primary/10",
              )}
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-5 text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-2 break-words font-mono text-2xl font-semibold leading-none text-foreground data-number">
                    {metric.value}
                  </p>
                </div>
                {metric.delta ? <DeltaBadge delta={metric.delta} /> : null}
              </div>

              {metric.detail ? (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {metric.detail}
                </p>
              ) : null}

              {source ? (
                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                  <span className="min-w-0 break-words font-medium text-foreground">
                    {source.label}
                  </span>
                  <ArrowRight className="size-3 text-primary" />
                  <span className="min-w-0 break-words">{source.publisher ?? source.confidence}</span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="workbench-label text-muted-foreground">
          Source registry
        </p>
        <SourceRail sources={sources} />
      </div>
    </BlockFrame>
  );
}
