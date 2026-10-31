# Confirmed delisting and annual cash refunds

Admin → Rentals → **Delisting & refunds** is the permanent removal workflow.
Choose a property or provider account, record the reason, then confirm. Provider
removal applies to all its Rentals properties and preserves any Hub membership.
Flags, temporary review holds, ordinary availability and owner Hide remain
separate. Those actions do not trigger this policy.

Removal is persisted first and cannot be undone with Show listing, approval or
webhooks. Owned Stripe listing subscriptions are canceled without proration or
a new final invoice. Monthly payments retain the current paid month. Annual
listing balances use full days remaining from the original confirmed removal
time, actual paid listing lines, discounts and collected tax. Campaign lines are
excluded. Retries keep the same effective time and do not create another task.
An outage leaves a visible pending cancellation, alerts Admin and retries via
the existing hourly Rentals job. Check pending failures promptly before renewal.

## Issuing an annual refund

This release **does not issue cash refunds automatically** or expand the
restricted API key's permissions. The Admin task links to the paid Stripe invoice.
Review prior refunds, disputes and credit adjustments there. Issue the cash
refund through Stripe, then record the actual amount, Stripe refund ID (`re_…`)
and outcome in EOD-HUB. Confirm that the money was issued before saving. The
record action emails the provider; it does not move money. A prior adjustment
may reduce the recorded amount below the calculated balance. Exceptional or
ambiguous invoices and original catalog billing require manual review. Stripe
refund IDs are unique in this ledger. Do not refund twice when a task is retried.

Normal billing receipts, annual reminders and the seven-day payment recovery
window remain. Delisted properties cannot reactivate or renew via those paths.
A payment received after removal or a subsequent refund/dispute sends Admin an
adjustment alert for review. No new tax collection is enabled in this release.

The migration adds private service-role-only tables/functions and immutable
delisting guards. It does not change Auth signup, Hub roles, member counts or
shared schema grants. Focused local Stripe stubs make no external calls; the
full PGlite suite checks actual SQL and authorization. Real charges/refunds are
not made as deployment tests.
