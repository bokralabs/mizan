import type { ReactElement } from "react";
import { MetricStripBlock } from "@/components/generative-ui/metric-strip-block";
import { RankingTableBlock } from "@/components/generative-ui/ranking-table-block";
import { TimelineFeedBlock } from "@/components/generative-ui/timeline-feed-block";
import type {
  GenerativeBlock,
  GenerativeBlockDefinition,
  GenerativeBlockKind,
} from "@/components/generative-ui/types";

type RegistryMap = {
  [K in GenerativeBlockKind]: GenerativeBlockDefinition<K>;
};

export const generativeBlockRegistry: RegistryMap = {
  metricStrip: {
    kind: "metricStrip",
    label: "Metric Strip",
    description:
      "Dense overview block for sourced headline metrics and compact trend context.",
    render: (payload) => <MetricStripBlock {...payload} />,
  },
  rankingTable: {
    kind: "rankingTable",
    label: "Ranking Table",
    description:
      "Clean comparison block for entities ranked by a structured score.",
    render: (payload) => <RankingTableBlock {...payload} />,
  },
  timelineFeed: {
    kind: "timelineFeed",
    label: "Timeline Feed",
    description:
      "Chronology block for sourced events, impact labeling, and evidence tags.",
    render: (payload) => <TimelineFeedBlock {...payload} />,
  },
};

export const generativeBlockCatalog = Object.values(generativeBlockRegistry);

export function renderGenerativeBlock(block: GenerativeBlock): ReactElement {
  switch (block.kind) {
    case "metricStrip":
      return <MetricStripBlock {...block.payload} />;
    case "rankingTable":
      return <RankingTableBlock {...block.payload} />;
    case "timelineFeed":
      return <TimelineFeedBlock {...block.payload} />;
  }
}
