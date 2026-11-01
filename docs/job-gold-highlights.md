# Gold job highlights and explicit priority rules

Admins can select **Gold highlight** while reviewing jobs or from an Admin job
card/detail view. The dialog accepts one or more custom labels (up to six, 40
characters each), with quick suggestions for Great pay, Great location and Job
of the day. Saving adds the gold border and labels; removing it clears them.
Pending jobs still require approval. Gold does not extend the normal listing
retention period or override rejection, suppression or type exclusions.

Gold appears on member job cards, saved jobs, job details and the job feed. Compact
recent-feed tiles keep their 128 × 96 layout, show the first compact gold label
and a +N count for additional labels. Opening a tile preserves all labels.
Highlight edits update tiles within the same session; returning to or focusing
the feed refreshes its ten recent jobs to pick up changes from another Admin tab.
Gold highlights filters are available on
Jobs and in Admin review. The Admin Gold filter turns off Pending only so approved
picks remain easy to find. Keyword search also searches custom labels. Existing
list/map filters, layout, permissions and map behavior are retained.

## Teaching future reviews

The same dialog can save a title phrase as an explicit 90- or 100-point priority
rule. By default it requires EOD / CBRN / CWMD mission evidence in the description.
Admins can instead apply a priority to this specific job only, including when an
imported excerpt omits qualifications they verified at the source. These overrides
are keyed to the job ID and do not boost other jobs with the same title.
Admins can save only the priority rule by turning off the public gold option.
Matching uses normalized whole-word phrases; overlapping rules do not stack.
Exclusions always take precedence. Manage/remove explicit rules under Exclusions
& learning. Resetting ordinary learned feedback preserves these explicit rules;
removing a gold border also preserves them. Rules affect review ranking of
current and future imported jobs; they do not widen provider searches, approve
jobs or automatically apply public gold labels. Ordinary approval feedback still
learns bounded title adjustments after three distinct examples agree.

## Requested priority corrections

- Direct Bomb Tech / Bomb Technician, EOD Technician and UXO Technician titles score 100, including SME and Security Clearance variants.
- Chemical Security and Elimination SME / Subject Matter Expert titles score
  100, including A&AS prefixes, “and” / “&” and Security Clearance suffixes. This
  is an explicit priority role requested by the owner, including imported excerpts
  that omit the qualification text. The explanation states the actual reason.
- Explicit EOD technician experience / qualifications or EOD school graduation
  in the body score 100. NAVSCOLEOD and Naval School EOD variants are recognized.
  This includes EOD qualified / Explosive Ordnance Disposal qualified, whether
  required or desired. A reviewed job-specific override can cover a source
  excerpt that ends before those qualifications, as with the SOAE Expert listing.
  Negated requirements, employer-founder boilerplate, repeated keywords and
  descriptions that only say “working with EOD technicians” do not qualify.
- Technical Project Manager and Policy SME / Policy Subject Matter Expert score
  at least 90 when the body has EOD / CBRN / CWMD mission evidence.
- Manually chosen gold jobs score 100 in review, subject to exclusions.

Specialist degree requirements remain visible as education notes when an explicit
priority floor takes precedence. The score measures review priority, not a hiring
probability or confirmation that an individual meets every job requirement.
Other description-only matches retain the existing conservative cap.

## Storage and security

Gold fields are separate from source/import metadata. The service-only invoker
RPC updates the highlight and optional teaching rule atomically with a row lock
and revision check. No approval column is touched. Owner edits and source refreshes
preserve highlights. A database trigger prevents ordinary job owners from assigning
or changing gold fields through direct table requests. Priority rules have RLS,
no public/member/rental-role grants and an Admin-authenticated server API.

Verification includes focused scoring/filter/API tests, actual local SQL roundtrips
for owner protection, stale edits, atomic rollback and import preservation, and
a local browser preview that saves labels before approval, retains them after
approval/reload, teaches a rule without gold and checks portrait/landscape and
both themes. The exact live Chemical Security/Elimination variants were read
without mutation and all scored 100 with the revised scorer. Their 500-character
source excerpts remain excerpts; no qualification text is fabricated.
