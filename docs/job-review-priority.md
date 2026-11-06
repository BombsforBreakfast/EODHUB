# Positive job review scoring

Imported jobs require manual approval. Scores are review hints, never publication decisions. The admin queue defaults to **All**, globally sorted by score before pagination. High, possible, low and Gold filters remain optional; low-scoring jobs stay available.

| Positive evidence | Title | Description |
| --- | ---: | ---: |
| Explosive Ordnance Disposal (complete phrase) | 100 | 100 |
| Explosive Ordnance (complete phrase) | 100 | 100 |
| UXO / Unexploded Ordnance | 100 | 85 |
| Bomb Tech / Bomb Technician | 100 | 85 |
| CWMD / C-WMD | 100 | 75 |
| Countering / Counter Weapons of Mass Destruction | 100 | 100 |
| Explosive / explosives | 75 | 60 |
| EOD acronym | 90 | 70 |
| Other related mission evidence | 70 | 45 |

The strongest evidence wins; repetition does not multiply scores. Matching ignores case, normalizes punctuation and spacing, uses word boundaries, and strips markup/script/style content. Existing explicit mission priorities and manually selected Gold highlights may raise the score; they never lower it.

Degree requirements and learned feedback do not reduce scores. Employer/role blacklists and source-specific negative gates stay disabled. Explicit admin-saved complete-title exclusions can block new imports; they do not alter positive scores or unpublish approved listings. Adzuna negative query terms and LinkedIn's title-only requirement are disabled. ReliefWeb confidence is informational and cannot veto manual approval.

Source queries, coverage, request limits, validation, duplicate handling and stale-listing retention remain in place. Approved current listings refresh rather than requeue. An individual manual deletion still removes that exact listing and its duplicate identity; it does not teach a title-wide exclusion or negative pattern.

Automatic approval is disabled in importer hooks and the database RPC. The RPC returns null without changing data; application roles have no execution grant. Previously published jobs are preserved.
