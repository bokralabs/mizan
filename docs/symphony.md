# Symphony Setup

Mizan has a repository-owned Symphony workflow at `WORKFLOW.md`. It lets the OpenAI Symphony reference service monitor a Linear project, create isolated workspaces, and run Codex App Server on each active issue.

This setup intentionally hands work off at `Human Review`. Mizan still requires human approval for merges, schema migrations, production deploys, and destructive operations.

## Prerequisites

- Codex CLI installed and logged in.
- GitHub CLI installed and authenticated for `Ba3lisa/mizan`.
- Linear personal API key in `LINEAR_API_KEY` or `.env.symphony.local`.
- `mise` installed for the Symphony Elixir reference implementation.
- A local checkout of `https://github.com/openai/symphony`, defaulting to `~/code/symphony`.

For the current Mizan project, `WORKFLOW.md` uses Linear `Project.slugId` `9ceb74fa6824`.
The Symphony Elixir reference implementation expects Linear's `Project.slugId`, which is the final id-like segment in the project URL.
Do not commit the Linear token to this repository; export it in your shell or inject it through your local secret manager.

## Install Symphony

From outside this repo:

```bash
git clone https://github.com/openai/symphony ~/code/symphony
cd ~/code/symphony/elixir
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build
```

## Check Setup

From the Mizan repo:

```bash
PYTHONPATH=scripts python3 -m dev symphony doctor
```

If you have the project `dev` command installed, this is equivalent:

```bash
dev symphony doctor
```

## Run

```bash
export LINEAR_API_KEY=...
PYTHONPATH=scripts python3 -m dev symphony run --port 4000
```

The dashboard is available at `http://localhost:4000` when `--port` is provided.
The `dev symphony run` wrapper passes Symphony's required engineering-preview acknowledgement flag for you.

## Workflow Notes

- Symphony dispatches `Todo`, `In Progress`, and `Rework` issues.
- Codex updates one `## Codex Workpad` Linear comment during the run.
- Codex creates a branch, validates the change, opens or updates a GitHub PR, attaches the PR to Linear, then moves the issue to `Human Review`.
- Symphony does not dispatch `Human Review`, so agents pause while maintainers review.
- `Done`, `Closed`, `Cancelled`, `Canceled`, and `Duplicate` are terminal states.

## Configuration

`WORKFLOW.md` uses:

- `~/code/mizan-symphony-workspaces` for per-issue workspaces.
- `git@github.com:Ba3lisa/mizan.git` for workspace clones, overrideable with `SOURCE_REPO_URL`.
- `gpt-5.3-codex` by default, overrideable with `CODEX_MODEL`.
- `codex` by default, overrideable with `CODEX_BIN`.
- One concurrent agent by default for safer first runs.

Adjust these values in `WORKFLOW.md` if your local machine or Linear workflow uses different conventions.
