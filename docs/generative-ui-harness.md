# Mizan Harness + json-render Generative UI

This documents the Mizan generative UI migration toward AI SDK HarnessAgent
plus json-render.

Current implementation:

- The homepage render boundary uses `@json-render/react`: generated board state is converted into a flat json-render spec and rendered through the Mizan registry.
- LLM calls use Vercel AI SDK directly. Convex remains the data authority and no longer hosts an external agent component.
- `/api/generative-ui/harness` is an opt-in HarnessAgent route. It is disabled unless `MIZAN_HARNESS_ENABLED=1` is set because it creates a Vercel Sandbox session.

Remaining migration:

- Change the homepage planner schema from `mzn-grid-v1` to direct json-render spec output.
- Stream json-render patches through AI SDK UI messages for progressive rendering.

## Target Flow

```mermaid
flowchart TD
  U[User prompt] --> C[Homepage chat client]
  C --> M[AI SDK message stream]
  M --> R[Next.js API route: /api/generative-ui/harness]

  subgraph HarnessRuntime[AI SDK HarnessAgent runtime]
    R --> HA[HarnessAgent]
    HA --> S[Sandbox session]
    HA --> H[Codex or Claude Code harness adapter]
    HA --> T[Mizan tools]
  end

  subgraph MizanTools[Mizan data/tool boundary]
    T --> DC[getDataContext]
    T --> DS[getSourceEvidence]
    T --> PV[getCurrentPageView]
    DC --> CV[Convex data pack]
    DS --> EV[Sanad + source URLs]
    PV --> UIState[Current json-render tree]
  end

  subgraph JsonRender[json-render generation]
    HA --> JP[catalog.prompt inline mode]
    CV --> JP
    EV --> JP
    UIState --> JP
    JP --> JSONL[Text + JSONL patches]
    JSONL --> Pipe[pipeJsonRender]
  end

  Pipe --> Parts[AI SDK UIMessage parts]
  Parts --> Chat[useChat]
  Chat --> Extract[useJsonRenderMessage]
  Extract --> Spec[json-render spec]
  Spec --> Renderer[Renderer + Mizan registry]
  Renderer --> UI[Generated charts, cards, forms, source panels]
```

## Component Boundary

```mermaid
flowchart LR
  Catalog[Mizan json-render catalog] --> Registry[Mizan React registry]
  Registry --> Cards[MetricCard]
  Registry --> Charts[BarChart / SplitBar / TrendChart]
  Registry --> Sources[SourcePanel + SanadBadge]
  Registry --> Forms[Scenario controls]
  Registry --> Layout[Stack / Grid / Section]

  Catalog --> Prompt[catalog.prompt]
  Prompt --> Harness[HarnessAgent]
  Harness --> JsonPatches[JSONL patches]
  JsonPatches --> Renderer[json-render Renderer]
```

## Migration Rules

- Remove the LLM-specific `mzn-grid-v1` plan as the public UI contract.
- Keep Convex as the data authority. Harness tools receive bounded data packs, not raw table access.
- Let json-render own the UI tree shape through a catalog and registry.
- Keep Sanad/source links as first-class registry components.
- Keep follow-up continuity by passing the current json-render spec/tree into the harness route.
- Keep the public route deterministic at the component boundary: the harness can choose catalog components, but cannot emit arbitrary JSX/CSS.

## Package Notes

- `HarnessAgent` is in AI SDK 7 canary/beta harness packages.
- json-render `0.19.x` uses `@json-render/core` and `@json-render/react`.
- The app is on AI SDK 7 canary at the top level. Guide chat and the LLM data pipeline use Vercel AI SDK directly; Convex stores messages and data in first-party tables.
