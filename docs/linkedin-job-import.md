# LinkedIn job import (local Mac)

LinkedIn has no public Jobs API. EOD-HUB uses a **local Playwright script** on your Mac that searches with your logged-in session and POSTs results to `/api/import-linkedin`. Jobs land in the admin queue (`is_approved = false`) like USAJobs/Adzuna.

**Legal note:** LinkedIn restricts automated access. Run low-frequency, on your own machine, with your own account. Re-auth when sessions expire.

## Prerequisites

- Node.js 20+ and this repo cloned
- Playwright Chromium: `npx playwright install chromium`
- `.env.local` with `CRON_SECRET` (same as other crons)
- Optional: `LINKEDIN_IMPORT_API_BASE=https://www.eod-hub.com` (defaults to production)

Apply migration `supabase/migrations/20260714120000_jobs_linkedin_import.sql` before first import.

## One-time LinkedIn login

```bash
npx tsx scripts/linkedin-jobs-import.ts --login
```

Log in in the browser window, press Enter in the terminal. Session saves to `~/.eod-hub/linkedin-auth.json`.

## Manual runs

```bash
# Scrape only (no DB write)
npx tsx scripts/linkedin-jobs-import.ts --dry-run --force

# Full import (bypasses 4:30–8 AM window and daily cap)
npx tsx scripts/linkedin-jobs-import.ts --force

# Normal guarded run (4:30–8 AM local, once per day)
npx tsx scripts/linkedin-jobs-import.ts
```

## Run-on-wake (recommended)

The script only runs when **local time is 4:30 AM – before 8:00 AM** and **at most once per calendar day**. Outside that window it exits immediately with `outside_import_window`.

Install the launchd agent:

1. Copy `scripts/linkedin-jobs-import.launchd.plist.example` to `~/Library/LaunchAgents/com.eodhub.linkedin-jobs-import.plist`
2. Edit paths (`/Users/YOU/...`)
3. `launchctl load ~/Library/LaunchAgents/com.eodhub.linkedin-jobs-import.plist`

`RunAtLoad` triggers on login/wake; guards inside the script prevent daytime runs.

## Searches

Configured in [`app/lib/linkedin/intakeConfig.ts`](../app/lib/linkedin/intakeConfig.ts). Each category runs as its own LinkedIn keyword search (acronym + expanded forms where applicable):

| Category | Search terms |
|----------|--------------|
| EOD | EOD, Explosive Ordnance Disposal, Direct Action EOD |
| UXO | UXO, Unexploded Ordnance |
| C-IED | C-IED, CIED, Counter IED, Improvised Explosive Device |
| UAS | UAS, Unmanned Aerial Systems |
| C-UAS | C-UAS, Counter UAS |
| CWMD / WMD | CWMD, C-WMD, Counter Weapons of Mass Destruction, WMD, Weapons of Mass Destruction |
| Explosive Safety | Explosive Safety, Explosives Specialist |

All scoped to United States, past week. Up to **4 jobs per search** (max **50** total per run) so every category gets representation. Relevance scoring reuses Adzuna EOD keyword weights.

## API

`POST /api/import-linkedin?secret=$CRON_SECRET` with body:

```json
{
  "jobs": [
    {
      "linkedinJobId": "1234567890",
      "title": "EOD Technician",
      "companyName": "Example Co",
      "location": "Virginia",
      "description": "Snippet text",
      "applyUrl": "https://www.linkedin.com/jobs/view/1234567890/",
      "searchQuery": "EOD",
      "relevanceScore": 75
    }
  ]
}
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `outside_import_window` | Expected outside 4:30–8 AM; use `--force` for manual runs |
| `already_ran_today` | Expected after a successful run; use `--force` to override |
| Session expired | Re-run `--login` |
| Empty scrape | LinkedIn DOM may have changed — check selectors in `scripts/linkedin-jobs-import.ts` |
| Import API 401 | Verify `CRON_SECRET` matches production |

Logs (if using launchd): `~/.eod-hub/linkedin-import.log`
