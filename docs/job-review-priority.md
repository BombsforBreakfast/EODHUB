# Job review priority

The admin Jobs review queue opens in Strong matches and sorts highest score first across all sources. Possible matches, Low confidence and All jobs remain available with their own counts. Filtering and ranking happen before the existing 25-item pagination. No job is automatically approved or deleted because of its score. Public Jobs and intake recall are unchanged.

Scores are deterministic review points, not hiring probabilities. They are recomputed from current title and description, independently of provider-specific intake scores:

- A title match starts at 70 points (Strong). Additional distinct specialty families add up to 10 points; description evidence adds 15.
- Description-only matches start at 40 and cap at 60 (Possible), even with repeated keywords or many specialty families.
- No priority keyword scores zero (Low). Generic clearance, disposal, direct action and employer names do not increase priority.
- Existing hard exclusions always score zero and explain the exclusion.

High-priority specialties include EOD, UXO, IED/C-IED, CBRN/CBRNE, CWMD/WMD, explosives/ordnance, UAS/UAV/drone and humanitarian mine action/demining. Whole-word matches prevent incidental substrings, and repeated terms, synonyms and overlapping ordnance phrases do not inflate the score. Cards show the matching terms and their title/description locations.

The opt-in admin API query parameter `priority=high|possible|low|all` enables global ranking and tier counts. Callers omitting it keep the existing source-group ordering. The ranking path reads every eligible row in ordered batches, applies no data mutations, and returns only the requested page. Authorization and moderation-memory protections remain in place.


Gold highlights and explicit mission-role priorities add documented 90/100-point floors. See [Gold job highlights](job-gold-highlights.md) for the Chemical Security/Elimination SME, EOD credential and management/policy exceptions, custom tags and Admin teaching rules. Other description-only jobs retain the existing cap. Scores remain review aids; gold does not approve a listing.
