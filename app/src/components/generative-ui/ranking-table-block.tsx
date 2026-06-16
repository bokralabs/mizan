import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlockFrame, SourceRail, getSourceById } from "@/components/generative-ui/block-frame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MetricDelta, RankingTableBlockData } from "@/components/generative-ui/types";

function TrendCell({ trend }: { trend?: MetricDelta }) {
  if (!trend) {
    return <span className="text-sm text-muted-foreground">No signal</span>;
  }

  const Icon =
    trend.direction === "up"
      ? TrendingUp
      : trend.direction === "down"
        ? TrendingDown
        : Minus;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 py-1 text-xs",
        trend.direction === "up" && "border-emerald-600/40 bg-emerald-500/10 text-emerald-700",
        trend.direction === "down" && "border-rose-600/40 bg-rose-500/10 text-rose-700",
        trend.direction === "flat" && "border-border/70 bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      <span>{trend.label}</span>
    </div>
  );
}

function ScoreDisplay({ value, score }: { value: string; score: number }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-base font-semibold text-foreground data-number">
        {value}
      </div>
      <div className="h-2 overflow-hidden rounded-[3px] bg-muted/70">
        <div
          className="h-2 w-full origin-left rounded-[3px] bg-primary transition-transform duration-500"
          style={{ transform: `scaleX(${Math.max(4, Math.min(score, 100)) / 100})` }}
        />
      </div>
    </div>
  );
}

function SourceLink({
  source,
}: {
  source: ReturnType<typeof getSourceById>;
}) {
  if (!source) {
    return <span className="text-sm text-muted-foreground">Unmapped source</span>;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1.5 text-sm leading-5 text-primary hover:underline"
    >
      <span className="min-w-0 break-words">{source.label}</span>
      <ArrowUpRight className="size-3.5 shrink-0" />
    </a>
  );
}

export function RankingTableBlock({
  eyebrow,
  heading,
  summary,
  metricLabel,
  rows,
  sources,
  footerNote,
}: RankingTableBlockData) {
  return (
    <BlockFrame
      eyebrow={eyebrow}
      heading={heading}
      summary={summary}
      footerNote={footerNote}
    >
      <div className="workbench-tile overflow-hidden rounded-[9px] border border-border/70 bg-background/60">
        <div className="grid gap-2 p-2 md:hidden">
          {rows.map((row, index) => {
            const source = getSourceById(sources, row.sourceId);

            return (
              <article
                key={row.id}
                className="rounded-[7px] border border-border/60 bg-card/70 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-primary bg-primary/15 font-mono text-xs text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold leading-5 text-foreground">{row.label}</p>
                    {row.context ? (
                      <p className="text-xs leading-5 text-muted-foreground">{row.context}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 rounded-[6px] border border-border/50 bg-background/70 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="workbench-label text-muted-foreground">{metricLabel}</p>
                      <ScoreDisplay value={row.value} score={row.score} />
                    </div>
                    <TrendCell trend={row.trend} />
                  </div>
                  <div className="border-t border-border/50 pt-2">
                    <p className="workbench-label mb-1 text-muted-foreground">Source</p>
                    <SourceLink source={source} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden md:block">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[52%]" />
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[17%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead className="whitespace-normal px-4 text-[0.68rem] tracking-[0.12em] uppercase text-muted-foreground">
                Entity
              </TableHead>
              <TableHead className="whitespace-normal px-4 text-[0.68rem] tracking-[0.12em] uppercase text-muted-foreground">
                {metricLabel}
              </TableHead>
              <TableHead className="whitespace-normal px-4 text-[0.68rem] tracking-[0.12em] uppercase text-muted-foreground">
                Signal
              </TableHead>
              <TableHead className="whitespace-normal px-4 text-[0.68rem] tracking-[0.12em] uppercase text-muted-foreground">
                Source
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const source = getSourceById(sources, row.sourceId);

              return (
                <TableRow key={row.id} className="border-border/60">
                  <TableCell className="whitespace-normal px-4 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-primary bg-primary/15 font-mono text-xs text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold leading-5 text-foreground">{row.label}</p>
                        {row.context ? (
                          <p className="max-w-[34rem] text-xs leading-5 text-muted-foreground">
                            {row.context}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal px-4 py-4 align-top">
                    <ScoreDisplay value={row.value} score={row.score} />
                  </TableCell>
                  <TableCell className="px-4 py-4 align-top">
                    <TrendCell trend={row.trend} />
                  </TableCell>
                  <TableCell className="whitespace-normal px-4 py-4 align-top">
                    <SourceLink source={source} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Rows are deterministic: each label, score, and signal resolves from the
          structured payload instead of ad-hoc prose generation.
        </div>
        <Badge variant="outline" className="rounded-[6px] border-border/70 bg-background/70">
          Agent-safe table block
        </Badge>
      </div>

      <SourceRail sources={sources} />
    </BlockFrame>
  );
}
