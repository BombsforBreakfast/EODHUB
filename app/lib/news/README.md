# News ingestion (v1)

Lean server-side pipeline that adds 5–10 high-relevance EOD-related external
stories per day. Approved items become **shadow posts** in `public.posts`
authored by the `RUMINT` system user (see
`supabase/migrations/20260420040000_news_shadow_posts.sql`). This means news
items render in the feed as regular posts with full community features —
likes, comments (incl. emojis + GIFs), Kangaroo Court, Rabbithole save —
without any news-specific render path.

Everything ingestion-related lives under `app/lib/news/`. The
`news_items` table is still the ingestion/moderation workspace; a DB trigger
keeps its `shadow_post_id` in sync with the `public.posts` row that
represents it in the feed.

## Approval gate

Nothing reaches the public feed automatically. New items land in
`news_items` with `status = 'pending'`. An admin reviews them in the Admin
Panel **News** tab and clicks **Approve to feed** or **Reject**. Only
`status = 'published'` rows are visible to anon/authenticated readers (RLS
enforced).

## Pipeline

1. **Discovery** — curated RSS + GDELT phrase queries (worldwide recall)
2. **Keyword score** — cheap first filter (`config/keywords.ts`)
3. **Body enrich** — fetch article text for borderline hits
4. **AI judge** — Vercel AI Gateway LLM requires *explicit* bomb-tech / EOD /
   UXO / IED / bomb squad / bomb threat framing (`aiJudge.ts`)
5. **Dedupe + caps** — insert survivors as `pending`

Job imports (USAJobs / Adzuna / ReliefWeb / LinkedIn) never use AI Gateway —
they are deterministic API/scrapes. Rumint news uses Gateway only for the
LLM relevance step.

## AI Gateway setup

On Vercel (production/preview), enable **AI Gateway** for the project, then
deploy. OIDC auth is automatic (`VERCEL=1`).

Locally:

```bash
vercel link
vercel env pull .env.local --yes
```

Or set a static `AI_GATEWAY_API_KEY` from the Vercel AI Gateway dashboard.

Optional: `NEWS_AI_MODEL` (default `google/gemini-2.5-flash`).

If Gateway auth is missing, ingestion falls back to keyword-only and records
`aiSkippedReason` in the run stats.

## Operations

### Ingestion trigger (admin only)

News is **not** on a schedule. Pull stories only when you want them:

- **Admin Panel → News → Run ingestion now** calls
  `POST /api/admin/news/run-ingestion` (same caps and idempotency as before).

Optional shell trigger (requires `NEWS_CRON_SECRET` on Vercel if you keep the route):

```bash
curl -X POST -H "Authorization: Bearer $NEWS_CRON_SECRET" \
  https://www.eod-hub.com/api/cron/news-ingest
```

The endpoint returns stats including `aiJudged`, `aiAccepted`, `aiRejected`.

The hourly Supabase pg_cron job was removed in migration
`20260605120000_unschedule_news_ingest_cron.sql`.

## Tuning

| What you want to change | File |
| --- | --- |
| Add/remove an RSS source | `config/sources.ts` |
| Edit GDELT search queries | `config/queries.ts` |
| Add positive/negative keywords or score weights | `config/keywords.ts` |
| AI relevance prompt / model | `aiJudge.ts` |
| Per-run / per-day caps | `runner.ts` (`MAX_PER_RUN`, `MAX_PER_DAY`) |
| Discovery API provider | `providers/discovery.ts` (swap behind `NewsProvider` interface) |

## Env vars

| Var | Where | Purpose |
| --- | --- | --- |
| `NEWS_CRON_SECRET` | Vercel (optional) | Bearer auth for `/api/cron/news-ingest` if invoked manually via curl |
| `AI_GATEWAY_API_KEY` or OIDC | Vercel / `vercel env pull` | Auth for the LLM relevance judge |
| `NEWS_AI_MODEL` | Optional | Override judge model slug |
| `NEXT_PUBLIC_SUPABASE_URL` | Already set | Used by both client + service-role server code |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set | Service-role inserts into `news_items` |

(GDELT requires no API key.)
