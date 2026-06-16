import { tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  prompt: z.string().min(1),
  currentSpec: z.unknown().optional(),
  catalogPrompt: z.string().optional(),
});

const jsonRenderSpecSchema = z.object({
  root: z.string().min(1),
  elements: z.record(z.string(), z.object({
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(z.string()).optional(),
    visible: z.unknown().optional(),
  })),
  state: z.record(z.string(), z.unknown()).optional(),
});

type JsonRenderSpec = z.infer<typeof jsonRenderSpecSchema>;

const importRuntimeModule = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;

export async function POST(request: Request) {
  if (process.env.MIZAN_HARNESS_ENABLED !== "1") {
    return NextResponse.json(
      {
        error: "HarnessAgent route is disabled. Set MIZAN_HARNESS_ENABLED=1 and configure Vercel Sandbox credentials to use it.",
      },
      { status: 501 },
    );
  }

  const body = requestSchema.parse(await request.json());
  let submittedSpec: JsonRenderSpec | null = null;

  const submitJsonRenderSpec = tool({
    description: "Submit the final json-render spec for Mizan to render.",
    inputSchema: jsonRenderSpecSchema,
    execute: async (spec) => {
      submittedSpec = spec;
      return { ok: true };
    },
  });

  // harness-codex resolves its bridge files dynamically; keep these imports out
  // of Next/Turbopack's static graph until the explicit env-gated route is used.
  const [{ HarnessAgent }, { createCodex }, { createVercelSandbox }] = await Promise.all([
    importRuntimeModule<typeof import("@ai-sdk/harness/agent")>("@ai-sdk/harness/agent"),
    importRuntimeModule<typeof import("@ai-sdk/harness-codex")>("@ai-sdk/harness-codex"),
    importRuntimeModule<typeof import("@ai-sdk/sandbox-vercel")>("@ai-sdk/sandbox-vercel"),
  ]);

  const agent = new HarnessAgent({
    id: "mizan-json-render-harness",
    harness: createCodex({
      reasoningEffort: "medium",
      webSearch: false,
    }),
    sandbox: createVercelSandbox({
      runtime: "node24",
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    tools: {
      submitJsonRenderSpec,
    },
    instructions: [
      "You are Mizan's generative UI harness.",
      "Return UI by calling submitJsonRenderSpec exactly once.",
      "The submitted object must be a @json-render/react flat spec: { root, elements, state? }.",
      "Use only component names and props from the supplied catalog prompt.",
      "Never invent data. Prefer concise, sourced civic and economic UI.",
    ].join("\n"),
  });

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt: [
        body.catalogPrompt ? `CATALOG:\n${body.catalogPrompt}` : null,
        body.currentSpec ? `CURRENT SPEC:\n${JSON.stringify(body.currentSpec)}` : null,
        `USER PROMPT:\n${body.prompt}`,
      ].filter((part): part is string => part != null).join("\n\n"),
    });

    return NextResponse.json({
      text: result.text,
      spec: submittedSpec,
    });
  } finally {
    await session.destroy();
  }
}
