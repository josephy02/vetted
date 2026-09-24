# vetted

[![CI](https://github.com/josephy02/vetted/actions/workflows/ci.yml/badge.svg)](https://github.com/josephy02/vetted/actions/workflows/ci.yml)

AI copilot that verifies vendor identity and screens for risk signals across the live web, powered by Exa.

Enter a US company name. In under a minute you get:

- **Verified identity**: legal name, state of registration, entity status, officers, and an OFAC watchlist check, from [Baselayer](https://exa.ai/docs/reference/agent-api/connect/baselayer.md) via an Exa Agent run.
- **Cited adverse-media findings**: lawsuits, breaches, regulatory actions, and executive issues from the last three years, each linked to its source.
- **A risk memo**: a plain-language rationale and a recommendation (proceed, proceed with caution, or escalate for review) that cites only the findings shown.
- **Ongoing monitoring**: one click subscribes the vendor to daily re-screening.

## Run it locally

Requires Node 20+.

```bash
cp .env.local.example .env.local   # then add EXA_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

| Variable | Required | Notes |
| --- | --- | --- |
| `EXA_API_KEY` | yes | Needs the Baselayer Exa Connect provider enabled. |
| `ANTHROPIC_API_KEY` | yes | Used for the risk-memo synthesis step. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5`. |
| `APP_URL` | no | Public HTTPS origin. When set (or on Vercel), monitoring uses real Exa Monitors. |
| `ACCESS_CODE` | no | When set, live screenings and new monitors require this code. Set it on any public deployment. |

## How it works

```
Browser ──POST /api/screen──▶ Next.js route (holds the API keys)
                               ├─ Exa Agent run + baselayer  ─┐  in parallel
                               ├─ Exa Search (news, 3 years) ─┘
                               └─ Claude via AI SDK: structured memo from those inputs only
        ◀── NDJSON stream: one event per step, then the full result
```

- `lib/exa.ts`: KYB verification (`exa.agent.runs.createAndWait` with `dataSources: [{ provider: "baselayer" }]` and a strict output schema), adverse-media search (Dynamic Highlights, falling back to standard highlights), and Exa Monitors.
- `lib/synthesis.ts`: builds the memo with `generateText` + `Output.object`. It then drops any finding that doesn't map to a real source, and renumbers citations so they match the list.
- `app/api/screen/route.ts`: runs both lookups in parallel and streams progress. If one step fails, the result is still returned with a warning saying what's missing.
- `app/api/monitor/*`: creates and checks monitors, and receives signed Exa webhooks.

### Monitoring

Exa Monitors re-run a search on a schedule, drop results they've already returned, and deliver new ones to a webhook. That's the whole "re-screen and diff" loop, so `/api/monitor` uses them directly whenever the app has a public HTTPS URL for the webhook. Locally, where Exa can't reach the webhook, it falls back to saving today's results as a baseline and diffing against it each time you click "Check for new coverage now".

## Cost controls

Each screening makes one Baselayer business search (about $1.00) plus an OFAC screen, with the Agent run at `effort: "low"`. Lien and litigation searches are explicitly skipped. Complete results are cached in memory for an hour per company/city/state, so screening the same vendor again doesn't bill again. Each client is limited to 5 screenings and 5 new monitors per minute. A public deployment should also set `ACCESS_CODE`, so that only people with the code can run billed screenings. Anyone can still replay the saved screenings at `?demo=cached`.

## Design decisions

- **`exa-js` directly, not `@exalabs/ai-sdk`.** The memo must cite only the sources the app retrieved. Giving the model a search tool would let it bring in sources outside that set, so retrieval happens first and the AI SDK is used only for structured synthesis.
- **Dynamic Highlights instead of highlights + summary.** Exa's docs recommend one content view per request, and a per-result summary adds a model call per page.
- **Streamed progress, not streamed memo text.** The memo is a structured object, so the route streams step completions (which drive the loading screen) and sends the memo once it's complete.

## Known limits (v1)

- State (cache, rate limits, webhook secrets, local monitors) is in memory, so it resets on restart and isn't shared across serverless instances. It needs a KV store before real use.
- US entities only, matching Baselayer's coverage.
- The output is a research memo for a human to review, not an approval decision.
