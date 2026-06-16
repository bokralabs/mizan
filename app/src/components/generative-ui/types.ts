import type { ReactElement } from "react";

export type DataConfidence =
  | "official"
  | "secondary"
  | "estimated"
  | "unverified";

export interface BlockSource {
  id: string;
  label: string;
  url: string;
  publisher?: string;
  lastUpdated?: string;
  confidence: DataConfidence;
}

export interface MetricDelta {
  direction: "up" | "down" | "flat";
  label: string;
  context: string;
}

export interface SourcedMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
  sourceId: string;
  delta?: MetricDelta;
  emphasis?: "primary" | "default";
}

export interface MetricStripBlockData {
  eyebrow?: string;
  heading: string;
  summary: string;
  metrics: Array<SourcedMetric>;
  sources: Array<BlockSource>;
  footerNote?: string;
}

export interface RankedEntityRow {
  id: string;
  label: string;
  value: string;
  score: number;
  sourceId: string;
  context?: string;
  trend?: MetricDelta;
}

export interface RankingTableBlockData {
  eyebrow?: string;
  heading: string;
  summary: string;
  metricLabel: string;
  rows: Array<RankedEntityRow>;
  sources: Array<BlockSource>;
  footerNote?: string;
}

export interface TimelineSignal {
  id: string;
  label: string;
  eventDate: string;
  summary: string;
  evidence: Array<string>;
  sourceId: string;
  impact: "high" | "medium" | "low";
}

export interface TimelineFeedBlockData {
  eyebrow?: string;
  heading: string;
  summary: string;
  signals: Array<TimelineSignal>;
  sources: Array<BlockSource>;
  footerNote?: string;
}

export type GenerativeBlockKind =
  | "metricStrip"
  | "rankingTable"
  | "timelineFeed";

export interface GenerativeBlockPayloadMap {
  metricStrip: MetricStripBlockData;
  rankingTable: RankingTableBlockData;
  timelineFeed: TimelineFeedBlockData;
}

export type GenerativeBlockEnvelope<K extends GenerativeBlockKind> = {
    kind: K;
    payload: GenerativeBlockPayloadMap[K];
  };

export type GenerativeBlock = {
  [K in GenerativeBlockKind]: GenerativeBlockEnvelope<K>;
}[GenerativeBlockKind];

export interface GenerativeBlockDefinition<
  K extends GenerativeBlockKind = GenerativeBlockKind,
> {
  kind: K;
  label: string;
  description: string;
  render: (payload: GenerativeBlockPayloadMap[K]) => ReactElement;
}
