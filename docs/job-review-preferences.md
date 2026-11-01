# Admin job review preferences

The job queue combines the specialty keyword score with education requirements and bounded feedback adjustments. Review score is a triage aid, not a probability or an automatic approval.

## Specialist degrees

An explicit engineering, chemistry or biology degree in the returned description subtracts 10 points; preferred degrees or equivalent-experience alternatives subtract 5. Multiple degree fields and advanced degrees do not compound the penalty. General degrees, other subjects, explicitly optional degrees and experience alone do not trigger it. Degrees never exclude a job or prevent an otherwise qualifying automatic approval. The reason appears on the card. Missing/truncated descriptions cannot reveal a requirement they do not contain.

## Explicit-title automatic approval

At the end of each of the four imports, current pending imported jobs with “Explosive Ordnance Disposal”, “UXO” or “Unexploded Ordnance” in the title are automatically approved. The full three-word phrase must be contiguous, ignoring case and repeated whitespace. The EOD acronym, isolated words, company names and description-only mentions do not qualify. Titles describing a portfolio or including multiple roles remain in manual review.

All built-in/custom exclusions, ReliefWeb suppression, rejected-listing memory, current approved duplicates and 30-day retention remain authoritative. A service-only RPC locks and checks the unchanged listing snapshot, exclusions snapshot, flags and duplicate decisions immediately before updating. Changed listings stay pending. Failures leave eligible jobs available for manual review and appear in the import result. Metadata records the policy, reason and approval time. Automatic approvals never write human feedback. Manual submissions are not automatically approved.

## Exclude this type

Each job card opens an editable title phrase, previews current matching pending imported jobs, and requires a separate save click. Matching uses normalized whole words, not arbitrary regex or description text. Saving blocks that phrase across all four server-side importers and removes current pending imported matches with durable deletion memory. Jobs approved during cleanup are protected; already approved jobs remain live. Partial cleanup failures are reported and the rule can be saved again to finish.

Rules are shared by admins and managed under “Exclusions & learning”. Removing a custom rule permits future listings, but does not erase listing-specific deletion memory or restore removed jobs. Built-in exclusions remain in `jobImportExclusions.ts`, including broad police titles, firefighter/fire-command variants, and helicopter/rotary-wing pilots. Engineering degrees are penalties, not exclusions.

## Learning

Only new approvals and explicit “Not relevant” removals contribute. Ordinary Delete, stale cleanup, and type-exclusion cleanup do not imply a negative role preference. Decisions and job status changes are committed atomically through a service-role-only, security-invoker RPC. Repeated approval calls do not add votes. A title/employer/location snapshot survives job purges; past ordinary deletions cannot be interpreted as negative preferences.

Ranking uses the newest 2,000 feedback records, deduplicates reposts by normalized title/employer/location, and learns specific two-word title phrases. Generic adjective phrases and numbered job variants are ignored. A net three distinct agreeing examples are required; boosts/penalties are capped at 10 points, overlapping phrases do not stack, and description-only jobs cannot reach the Strong match tier. Exclusions override all boosts. Every adjustment has a visible reason.

“Reset learned ranking” clears feedback only. It does not clear type rules, change published jobs, or erase import memory. Existing approvals are not backfilled, so learning starts from new review actions.

Both preferences tables have RLS enabled and no public or authenticated-client grants. All reading/mutation passes through admin-authenticated server routes using the service role. Public Jobs, maps, rentals, source relevance scores, and source intake searches are unchanged.


## Explicit priorities and gold highlights

[Gold job highlights](job-gold-highlights.md) adds manual editorial labels and immediate title-priority rules, separate from the three-example learned feedback. Removing highlights or resetting feedback preserves explicit priorities. The Admin panel lists those rules for separate removal. New mission-priority floors retain visible education notes and never bypass exclusions or approval.
