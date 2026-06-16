# Update Docs

Synchronize all documentation in `docs/` with the current state of the codebase. Spawns one subagent per doc file for parallel processing.

## Trigger
User runs `/update-docs` or asks to update/sync documentation.

## Instructions

1. **List all doc files** by reading `docs/` directory.

2. **For each `.md` file in `docs/`**, spawn a parallel subagent using the Agent tool with:
   - `subagent_type: "general-purpose"`
   - `mode: "auto"`
   - `run_in_background: true`
   - A prompt that tells the agent to:
     a. Read the current doc file at `docs/<filename>`
     b. Read the relevant source code files that the doc describes (the agent should figure out which files are relevant from the doc's content)
     c. Compare the doc against actual code — find outdated info, missing features, wrong file paths, stale examples
     d. Update the doc to match current code reality
     e. Keep the same structure/format, just fix inaccuracies and add missing info
     f. Do NOT add speculative content — only document what exists in code
     g. Do NOT remove sections — only update or add

3. **Skip these files** (they are auto-managed):
   - `ARCH_SYNC`
   - `FEATURES_SYNC`
   - `ROADMAP.md` (user-managed)

4. **After all agents complete**, report a summary of what changed in each doc.

5. **Do NOT commit** — let the user review changes first.

## Example agent prompt template

```
Update the documentation file at docs/{filename}.

Read the doc first, then read the source code it references to verify accuracy. Fix any:
- Outdated file paths or function names
- Missing features that exist in code but aren't documented
- Stale architecture descriptions
- Wrong configuration examples
- Missing new components or APIs

Keep the same document structure. Only update facts, don't add opinions or speculation.
The project root is /Users/egouda/workspace/mizan and the app code is in app/.
Key directories: app/convex/ (backend), app/src/ (frontend), scripts/dev/ (CLI).
```

## Key rules
- Launch ALL agents in a SINGLE message for maximum parallelism
- Each agent works on exactly ONE doc file
- Agents should read code before writing — never guess
- Report results after all agents finish
