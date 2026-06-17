# Deployment Guide -- mizanmasr.com

## DNS Setup (Cloudflare)

1. Log into Cloudflare dashboard
2. Add site: mizanmasr.com
3. Add DNS records:
   - A record: `@` -> DigitalOcean app IP (or CNAME to DO app URL)
   - CNAME: `www` -> `mizanmasr.com`
4. Enable: Proxied (orange cloud)
5. SSL/TLS: Full (strict)
6. Page Rules:
   - `www.mizanmasr.com/*` -> 301 redirect to `https://mizanmasr.com/$1`

## Cloudflare Settings

- SSL: Full (strict)
- Always Use HTTPS: ON
- Minimum TLS: 1.2
- Auto Minify: JS, CSS, HTML
- Brotli: ON
- Caching Level: Standard
- Browser Cache TTL: 4 hours
- Edge Cache TTL: 2 hours (ISR pages revalidate)

## DigitalOcean Setup

1. Create App from Git source: `https://github.com/bokralabs/mizan.git`
2. Source directory: /app
3. Build command: `npm ci --legacy-peer-deps && npm run build`
4. Run command: `npm start`
5. Environment variables (configured in `.do/app.yaml`):
   - `NEXT_PUBLIC_CONVEX_URL` = production Convex URL
   - `NODE_ENV` = production
6. Instance: `professional-xs`, region `fra`, HTTP port 3000
7. Add custom domain: mizanmasr.com
8. Health check: `GET /` with 10s initial delay, 30s period

## Convex Production

1. Deploy Convex functions and Next.js together:
   ```bash
   npx convex deploy --cmd 'npm run build'
   ```
   The CI workflow (`deploy.yml`) runs this automatically on each release. The `--cmd` flag builds the Next.js app after pushing Convex functions, ensuring `NEXT_PUBLIC_CONVEX_URL` is available at build time.

2. Set environment variables in Convex dashboard:

   **LLM providers (at least one required for the data pipeline):**
   The pipeline uses a provider registry (`convex/agents/providers/registry.ts`) that picks the highest-priority available key. The LLM Council uses ALL configured providers (each casts a vote). Priority order:
   - `XAI_API_KEY` -- Grok (highest priority)
   - `OPENAI_API_KEY` -- GPT-4o-mini (also required for the guide chat agent, which uses `gpt-4.1-mini` via `@ai-sdk/openai`)
   - `ANTHROPIC_API_KEY` -- Claude Haiku 4.5
   - `GOOGLE_AI_API_KEY` -- Gemini 2.0 Flash
   - `OPENROUTER_API_KEY` -- any model via OpenRouter
   - `OPENROUTER_MODEL` -- (optional) override the default OpenRouter model

   **Other keys:**
   - `GITHUB_TOKEN` = GitHub personal access token with `issues:write` permission on `bokralabs/mizan` (required for the GitHub Issues AI agent to read and comment on community data corrections)

   **Dev-only:**
   - `DISABLE_CRONS=true` -- set in dev deployment to skip all cron jobs

3. The 12-hour cron job will start automatically

4. Seed production data:
   ```bash
   npx convex run --prod seedData:seedAll
   ```
   (`seedAll` is the public mutation wrapper; `seed` is internal-only)

5. Manually trigger a pipeline refresh:
   ```bash
   npx convex run --prod agents/dataAgent:triggerRefresh
   ```
   This public action schedules `orchestrateRefresh` to run immediately.

### Convex Components (convex.config.ts)

The app registers one Convex component:

- **`@convex-dev/rate-limiter`** -- enforces per-session rate limits on guide chat (1 msg/3s, ~10K tokens/hour)

This is declared in `convex/convex.config.ts` via `app.use(rateLimiter)`. Guide chat message storage now uses the app's `guideMessages` table.

### External Dependencies (convex.json)

The `pdf-parse` package is listed as an external dependency in `convex.json` because it is used server-side by the constitution agent to extract text from the Egyptian constitution PDF (`faolex.fao.org/docs/pdf/egy127542e.pdf`). Ensure it is installed in `node_modules` before deploying:

```bash
npm install pdf-parse --legacy-peer-deps
```

If `pdf-parse` is missing at runtime, the constitution refresh step will fail gracefully and log an error, but all other pipeline steps will continue.

### GitHub Token Setup

The `GITHUB_TOKEN` is used by `convex/agents/githubAgent.ts` to:
- Read open issues labelled `data-correction` or `stale-data`
- Post automated verification comments
- Apply the `verified` label when a correction is confirmed

Create a fine-grained personal access token at https://github.com/settings/tokens and grant it **Read and Write** access to Issues on the `bokralabs/mizan` repository. If the token is absent the GitHub agent skips all operations gracefully without failing.

## CI/CD Workflows

All workflows use Node.js 22 and are defined in `.github/workflows/`.

### deploy.yml -- Deploy to Production

Triggered on: GitHub release published, or manual `workflow_dispatch`.

Jobs (sequential):
1. **lint-and-typecheck** -- `npm run lint` + `npm run type-check` (`tsc --noEmit`)
2. **deploy-convex** -- `npx convex deploy --cmd 'npm run build'` (uses `CONVEX_DEPLOY_KEY` and `NEXT_PUBLIC_CONVEX_URL` secrets; sets `NEXT_PUBLIC_APP_VERSION` from the release tag or commit SHA)
3. **deploy-app** -- triggers DigitalOcean App Platform deploy via `digitalocean/app_action/deploy@v2`

The app spec uses the generic `git.repo_clone_url` source instead of the `github.repo` source. This lets the release workflow deploy from the public repository without depending on the DigitalOcean GitHub App installation having access to the `bokralabs/mizan` organization repository.

### lint.yml -- CI

Triggered on: push to `main`, pull requests (opened/synchronize/reopened/ready_for_review). Skips draft PRs.

Steps: install, ESLint (0 warnings), TypeScript (0 errors), `next build`.

### security.yml -- Security Scan

Triggered on: PRs, push to `main`, weekly schedule (Monday 6am).

Jobs: `npm audit`, CodeQL analysis, custom pattern checks (eval, dangerouslySetInnerHTML, dynamic fetch URLs, template literals in DB queries).

### secret-scan.yml -- Secret Scan

Triggered on: push to `main`, PRs.

Scans for leaked Convex deploy keys, Anthropic/GitHub/Slack tokens, and private keys.

### health-check.yml -- Pipeline Health Check

Triggered on: schedule (every 12h at 6am/6pm UTC), or manual `workflow_dispatch`.

Queries `dataRefresh:getAllLastUpdated` against the production Convex deployment. If any data category is stale (>48h), opens or updates a GitHub issue with the `pipeline-health` label. Auto-closes the issue when all categories are fresh.

## GitHub Secrets Required

Set these in bokralabs/mizan -> Settings -> Secrets:

| Secret | Source |
|--------|--------|
| `NEXT_PUBLIC_CONVEX_URL` | Production Convex URL from Convex dashboard |
| `CONVEX_DEPLOY_KEY` | Convex dashboard -> Settings -> Deploy key |
| `DIGITALOCEAN_ACCESS_TOKEN` | DigitalOcean -> API -> Personal access tokens |
| `DEEPSEEK_API_KEY` | DeepSeek API key for the Mizan generative UI chat |

Note: `NEXT_PUBLIC_APP_VERSION` is set automatically by the deploy workflow from the release tag (or commit SHA as fallback). It does not need to be configured as a secret.
