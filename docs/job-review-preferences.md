# Job review preferences

The job review system follows the [positive scoring policy](job-review-priority.md). All imported candidates require human approval.

- Explicit saved exclusions match complete normalized job titles across all four importers. No built-in role/employer blacklist or learned penalty is enabled.
- “Exclude exact title” opens a preview of pending imported matches across the entire queue, independent of the current search. Saving requires a fresh preview token; if the queue changes, HTTP409 asks for another preview before any write.
- A saved rule prevents new imports with that complete title and removes matching pending imported listings through existing rejection memory. Approved listings keep refreshing and remain live. Community-submitted listings are not removed by this action.
- The exclusion list starts empty. Remove a saved rule in the preferences panel to allow future matching imports; already rejected listings retain their normal moderation memory.
- Explicit positive priorities and Gold highlights are preserved. Priority removal remains available in the admin preferences panel.
- Individual Not relevant/deletion actions remove only the chosen listing and exact duplicate identity, without teaching negative title patterns.
- Automatic approval is disabled regardless of score. See the disable_automatic_job_approval migration.

The preferences panel manages exclusions and positive priorities. Admin authorization is unchanged. Previewing, searching and removing a rule never approve any job.

Admin Jobs also has live search, debounced300ms, across titles, employers, locations, categories and full descriptions. All words must match; case, accents and markup are normalized. Search applies before score-band counts and pagination across the complete queue, including database pages after row500. Pending/priority filters combine with search; clearing it restores the current queue. It does not save an exclusion rule. Stale requests cannot replace newer results, and changing the query clears page selections.
