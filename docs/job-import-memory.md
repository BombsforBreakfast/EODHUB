# Job import memory

Administrator removals of Adzuna, USAJOBS, LinkedIn and ReliefWeb jobs retain a hidden `is_rejected = true`, `is_approved = false` record. Provider IDs, original apply URL, title, employer and location stay available to prevent reimport. Saved-job references, stale flags and applications are removed, matching the previous deletion cascades. Manual jobs still use hard deletion.

All daily imports honor these decisions. In addition to their existing provider-ID checks, they compare job-specific apply URLs (ignoring tracking parameters) or an exact normalized title, employer and location. A title or employer alone is insufficient. Different locations remain eligible. Rejected decisions win when records conflict.

Recently approved jobs within the existing 30-day listing window are refreshed in place and never put back into pending review when a matching copy arrives with a new provider ID or through another source. Approval, original creation date and editorial content are preserved. Expired approvals do not suppress a genuinely new submission indefinitely.

Already queued copies of an approved or deliberately removed listing are retired when encountered again. Only pending, non-rejected copies can be deleted; database filters protect any copy approved since the snapshot. The original approval or rejection remains authoritative.

Rejected records do not expire. The general stale-job purge, source-specific purges and the weekly audit must preserve them. The weekly audit inventory must filter out `is_rejected = true` records and recheck that condition immediately before deletion.

Memory starts with retained records. Prior hard deletions cannot be reconstructed automatically; a previously deleted listing may need to be removed once more. A repost with a different title, employer, location and URL may need a new decision.

Verification: `tsx --test scripts/verify-job-import-memory.test.ts scripts/verify-job-import-exclusions.test.ts scripts/verify-usajobs-intake.test.ts scripts/verify-adzuna-intake.test.ts`.
