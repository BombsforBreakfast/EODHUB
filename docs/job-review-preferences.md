# Job review preferences

The job review system follows the [positive scoring policy](job-review-priority.md). All imported candidates require human approval.

- Saved exclusions and learned ranking are disabled; historical tables do not filter intake or score jobs.
- `add_exclusion` and `preview_exclusion` return HTTP 409 without listing changes. Legacy cleanup actions remain admin-only.
- Explicit positive priorities and Gold highlights are preserved. Priority removal remains available in the admin preferences panel.
- Individual Not relevant/deletion actions remove only the chosen listing and exact duplicate identity, without teaching negative title patterns.
- Automatic approval is disabled regardless of score. See the disable_automatic_job_approval migration.

The preferences panel explains the current weights and manages positive priorities. The old exclusion dialog/action are removed. Admin authorization is unchanged.
