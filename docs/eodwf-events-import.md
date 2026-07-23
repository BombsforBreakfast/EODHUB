# EODWF events import

Monthly (and on-demand) import of EOD Warrior Foundation events into the EOD-HUB calendar approval queue.

## Sources

| Source | How |
|--------|-----|
| Main calendar | Tribe Events REST `https://eod-wf.org/wp-json/tribe/events/v1/events` |
| Monthly gatherings | HTML parse of `https://eod-wf.org/eod-monthly-gatherings/` |
| Retreats | HTML parse of `https://eod-wf.org/retreats-calendar/` |

Imports land in `events` with `is_approved = false`, `source_type` in `eodwf_calendar` | `eodwf_gathering` | `eodwf_retreat`, and dedupe on `(source_type, source_url)`.

Flyers (when present) download into Supabase Storage `feed-images/event-covers/…` and set `image_url`.

## Schedule

- **Cron:** `0 12 1 * *` → `GET/POST /api/import-eodwf-events` (1st of each month, 12:00 UTC)
- Auth: `Authorization: Bearer $CRON_SECRET` or `?secret=`

## On-demand (admin)

Admin → Events → **Pending imports** → **Pull from EODWF now** (Bearer session of an `is_admin` user). Same import route.

## Approval

Pending rows are hidden from the public calendar (RLS + client filters). Approving sets `is_approved = true`, which fires the linked feed-post trigger. Reject deletes the pending row.

Requires `hello@eod-hub.com` profile for the import author / auto-post attribution.
