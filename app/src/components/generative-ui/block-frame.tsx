import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BlockSource, DataConfidence } from "@/components/generative-ui/types";

const confidenceLabel: Record<DataConfidence, string> = {
  official: "Official",
  secondary: "Secondary",
  estimated: "Estimated",
  unverified: "Unverified",
};

const confidenceClassName: Record<DataConfidence, string> = {
  official: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700",
  secondary: "border-sky-600/40 bg-sky-500/10 text-sky-700",
  estimated: "border-amber-600/40 bg-amber-500/10 text-amber-700",
  unverified: "border-rose-600/40 bg-rose-500/10 text-rose-700",
};

export function BlockFrame({
  eyebrow,
  heading,
  summary,
  children,
  footerNote,
  className,
}: {
  eyebrow?: string;
  heading: string;
  summary: string;
  children: React.ReactNode;
  footerNote?: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "workbench-panel min-w-0 gap-0 overflow-hidden rounded-[9px] border-border/70 bg-card py-0 shadow-none",
        className,
      )}
    >
      <CardHeader className="relative min-w-0 gap-3 border-b border-border/80 bg-background/70 px-4 py-4">
        <div className="relative flex min-w-0 flex-col gap-3">
          {eyebrow ? (
            <Badge
              variant="outline"
              className="workbench-label w-fit rounded-[6px] border-primary bg-primary/15 px-2.5 py-1 text-primary"
            >
              {eyebrow}
            </Badge>
          ) : null}
          <div className="min-w-0 space-y-2">
            <CardTitle className="mizan-text-safe text-xl leading-tight text-foreground">
              {heading}
            </CardTitle>
            <p className="mizan-text-safe max-w-3xl text-xs leading-5 text-muted-foreground">
              {summary}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 bg-card px-4 py-4">{children}</CardContent>
      {footerNote ? (
        <div className="mizan-text-safe border-t border-border/80 bg-background/55 px-4 py-3 text-xs leading-5 text-muted-foreground">
          {footerNote}
        </div>
      ) : null}
    </Card>
  );
}

export function SourcePill({ source }: { source: BlockSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-h-10 max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <span className="mizan-text-safe min-w-0 font-medium text-foreground">{source.label}</span>
      <span className="text-muted-foreground/70">·</span>
      <span className="mizan-text-safe min-w-0">{source.publisher ?? confidenceLabel[source.confidence]}</span>
      <span
        className={cn(
          "shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase",
          confidenceClassName[source.confidence],
        )}
      >
        {confidenceLabel[source.confidence]}
      </span>
    </a>
  );
}

export function SourceRail({ sources }: { sources: Array<BlockSource> }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {sources.map((source) => (
        <SourcePill key={source.id} source={source} />
      ))}
    </div>
  );
}

export function getSourceById(
  sources: Array<BlockSource>,
  sourceId: string,
): BlockSource | undefined {
  return sources.find((source) => source.id === sourceId);
}
