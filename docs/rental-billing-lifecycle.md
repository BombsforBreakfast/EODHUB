# Rentals billing lifecycle

The billing follow-up adds payment confirmations, owner/customer alerts, seven-day review deadlines, annual reminders, and self-service renewal controls. It preserves the live V1 account isolation, approval-before-charge flow, original source listings, member billing, and support webhook.

## Customer behavior

- Every paid listing invoice queues one confirmation with the actual amount/currency, invoice number, line items, and hosted Stripe invoice link. This includes the first approved payment and later monthly/annual renewals. The $50 campaign remains a one-time first-invoice item.
- Cancel subscription schedules cancellation at the end of the paid term. An email confirms the choice. The customer can enable automatic renewal again before the subscription ends, with explicit recurring-price consent. After expiration, a new term uses the cart/approval flow. Old campaign choices do not default to being purchased again.
- Annual reminders run in the 30-day and seven-day windows before expiration. Emails state whether renewal is automatic or requires action, and link to the passwordless property portal. Reminder keys include subscription, term end, and reminder window.
- A failed payment, required payment authentication, stopped collection, refund, dispute, or fraud warning creates an owner/customer billing alert and a review case. Initial unpaid listings remain unpublished. Previously paid listings retain access during the applicable seven-day review window. Availability changes never cancel billing.
- Voluntary cancellation preserves the paid term; its seven-day renewal window begins when that term ends. Failure/review windows begin with the first incident, and event retries do not extend them. Resolving a payment clears payment cases, but does not silently clear a refund/dispute/fraud review.
- Access pauses at an unresolved deadline. Hourly maintenance stops future subscription billing without prorations/final invoices, preserves property details, and emails both parties. A canceled subscription cannot be restarted; a later term is a new approval-based subscription. An unresolved risk review blocks new paid terms.

## Owner workflow

Admin → Rentals → Billing lists open/resolved/expired cases, deadlines, Stripe references, and pending email retries. Refunds and dispute evidence are handled in Stripe by the owner. The app does not automatically refund, accept a dispute, or submit evidence. Existing case-by-case refund policy remains; canceling does not automatically refund or issue a prorated credit.

Record the review result when resolving a refund/dispute/fraud case; the provider receives that note. Payment failures/ended terms resolve through actual payment/renewal, not an admin override pretending an invoice was paid. A dispute won in Stripe resolves its listing review; other risk cases remain independent. Payment-network evidence deadlines are separate from the listing's seven-day review period.

Stripe Tax proportionally adjusts tax on refunds/credits for taxed invoices: https://docs.stripe.com/tax/invoicing/refunds . Use the original invoice/payment when issuing a refund, and inspect Stripe's tax adjustment. Credit notes can document invoice adjustments: https://docs.stripe.com/invoicing/dashboard/credit-notes . No blanket refund or tax filing automation has been enabled.

## Delivery and data

`rental_billing_emails` is a private durable outbox, with unique message keys, an atomic 15-minute send lease, Resend idempotency keys, and retries on subsequent events/hourly maintenance. A successful send means Resend accepted the message, not a guarantee of inbox placement. Unsent retry attempts are visible in Admin. No credit-card data is stored.

`rental_billing_cases` stores the minimum billing-review fields and owner notes. `rental_subscription_history` preserves the property mapping for older subscriptions, so a refund/dispute after renewal still maps through InvoicePayments → Invoice → Subscription to the correct property. All three tables have RLS enabled, no browser grants/policies, and service-role-only access. Existing Auth functions, membership grants, and Storage policies are unchanged.

The rental webhook adds only acted-on events: invoice.paid, customer.updated, charge.refunded, charge.dispute.created/closed, and radar.early_fraud_warning.created. Existing lifecycle event selections remain. Customer payment-method updates are propagated to rental subscriptions that had an explicit old default method. Current Stripe state is retrieved before applying failure/cancellation transitions, rather than trusting delivery order.

## Tax status / release limitation

Read-only live inspection on October 29, 2026 found Stripe Tax settings **pending**, with `head_office` missing, no default tax code/behavior, and **zero tax registrations**. No automatic tax collection or registration has been enabled. Business account verification and sales-tax registration are separate.

The setup flow now captures the provider's full billing address for accurate future tax calculations; it does not substitute the advertised property's address for the paying customer's billing location.

The owner confirmed North Carolina as the physical business state, no known sales-and-use-tax registration, prices exclusive of applicable tax, and digital Website Advertising classification for both services. New listing and campaign prices specify `tax_behavior: exclusive`; the isolated rental products use canonical `txcd_10701000` (Website Advertising). Catalog: https://docs.stripe.com/tax/tax-codes . No generic Nontaxable code is used.

NCDOR's 2026 Sales and Use Tax Bulletins, SUTB 8-1 and 8-2, distinguish qualifying professional advertising services from taxable retail sales of materials/certain digital property. The digital creation/publication scope appears consistent with advertising services, but an accountant or NCDOR should confirm the treatment of these exact listing/campaign fees and any out-of-state collection obligations before nationwide launch. Source: https://www.ncdor.gov/sutb-2026pdf/open . No legal registration or tax-exemption conclusion has been assumed from the LLC's location alone.

Do not enable automatic tax until applicable registrations are confirmed. A registration in Stripe records an existing legal registration; it does not register the business with a tax authority. Tax collection alone does not file returns. If collection is required, complete the accurate head-office address, record confirmed registrations, enable automatic tax on subscriptions, test a calculation, inspect taxability reasons, and document the outcome before calling tax collection complete.

## Verification

- Focused local tests cover receipts/retries/idempotence, failure windows and recovery, first-payment publication, annual reminder windows, cancellation grace, risk event ownership, dispute resolution, card replacement, and stopped collection.
- The PGlite migration suite verifies unchanged Auth/profile/member-count behavior, all private billing grants and RPCs, atomic email leases, and hold-aware public metrics.
- Real Stripe sandbox Test Clocks verified $10 renewal without recurring the $50 campaign; declined renewal and seven-day access boundary; real invoice payment recovery; and $100 annual term expiration without another invoice when renewal is off. These checks exercised real Stripe objects against an isolated local database adapter. No production database records, real funds, or delivered emails were used. Test clocks/customers/subscriptions were deleted.
- A real customer pilot, actual email receipt delivery, and a live tax calculation are distinct remaining checks. Do not manufacture a live charge purely for testing.
