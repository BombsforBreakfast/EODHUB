# EOD Arcade Credits — Design Spec (pre-implementation)

Status: **Planning saved on branch `cursor/eud-arcade-tokens-f1d0`** — not implemented yet.

This document captures product rules, wallet model, per-game life/checkpoint behavior, UI, billing hooks, and phased implementation for EOD Arcade credits.

---

## Product rules

| Rule | Decision |
|------|----------|
| Daily allowance | **10 credits/day** for standard users (basic tier baseline) |
| Rollover | **None** — unused daily credits expire at reset |
| Reset time | **12:01 AM Eastern** (align with existing paywall/date logic in `paywallWorkflow.ts`) |
| Out of credits | **Hard block** — cannot start/continue until reset, purchase, or (later) ad |
| Empty-state copy | *“Come back tomorrow for your next 10”* + *“Purchase more credits now”* |
| Proactive purchase | Tap **credit balance (top right)** → credit package picker |
| Beta access | Arcade stays **founder/preview gated** (`RequireArcadePreview`); credits apply for beta users |
| Employer / business | **Same 10/day**, **one shared pool** — not 10 per login |
| Ads (future) | Watch ~30s sponsored ad → **+1 credit** (or one free play) |
| Games in scope | **Render Safe** + **Bomb Suit Man** — identical credit *wallet* rules, different *life* rules |

---

## Wallet model (one pool per person)

Multiple auth identities can belong to one person:

- **Member** + **Employer** (same email via linked accounts — `app/api/linked-auth-accounts/route.ts`)
- **Business org** `owner_user_id` + `business_auth_user_id` (`business_organization_pages`)

They must **not** each get 10 credits. One person = **one daily pool of 10**.

### Wallet owner resolution

`resolveArcadeWalletOwner(userId) → walletOwnerUserId`:

1. If user is `business_auth_user_id` on a business org page → wallet = that page's `owner_user_id`
2. Else if `account_type === 'employer'` → wallet = linked primary member on same email (if exists), else self
3. Else (member, owner logged in normally) → wallet = self

All balance reads and spends use **`walletOwnerUserId`**. Log `actor_user_id` in the ledger when it differs (e.g. business auth spending owner's wallet).

### Spend order

**Daily credits first**, then **purchased credits**.

Purchased credits do not reset at midnight.

---

## Data model (proposed)

### `arcade_wallets`

| Column | Purpose |
|--------|---------|
| `wallet_user_id` | PK — resolved owner UUID |
| `daily_remaining` | 0–10 (or tier cap) |
| `purchased_remaining` | Bought credits (no daily reset) |
| `daily_allowance` | Default 10; tier-configurable later |
| `last_daily_grant_date` | ET date of last reset (e.g. `2026-06-10`) |
| `updated_at` | Audit |

### `arcade_credit_ledger` (append-only)

| Column | Purpose |
|--------|---------|
| `id` | UUID |
| `wallet_user_id` | Wallet owner |
| `actor_user_id` | Who triggered the action |
| `delta` | +10, −1, +50, etc. |
| `reason` | See credit actions below |
| `game_id` | `render_safe` \| `rainbow_cowboy` |
| `session_id` | Ties spend to a run |
| `idempotency_key` | Prevents double-charge |
| `metadata` | level, difficulty, etc. |
| `created_at` | Timestamp |

### Daily grant (lazy, on first arcade action after ET boundary)

```
if last_daily_grant_date < today_et:
  daily_remaining = daily_allowance   // reset to 10, NOT additive
  last_daily_grant_date = today_et
  ledger: daily_grant (informational)
```

---

## Credit actions (unified vocabulary)

| Action | Credits | When |
|--------|---------|------|
| `run_start` | 1 | First start of a level/mission (includes initial lives/hearts) |
| `continue_checkpoint` | 1 | Resume at last auto-checkpoint after lives/hearts exhausted |
| `new_turn` | 1 | Fresh turn — see per-game (RS: new game from level start; BSM: level restart + hearts reset) |
| `daily_grant` | — | Midnight ET reset |
| `purchase` | +N | Stripe package (user taps balance) |
| `ad_reward` | +1 | Future — after verified ad view |

**Pause → resume mid-turn:** free (same run, lives/hearts unchanged).

**Victory → next level:** recommend **1 credit** (`run_start`) for consistency.

---

## Shared checkpoint model

**Auto-checkpoint** on every turn-ending failure. Short levels → resume **where they died**, not at level start.

- Checkpoints stored **client-side** (`sessionStorage` + in-memory), keyed to `session_id`
- Server records **entitlements** only (paid continue / new turn), not full game state — per `GAME_COST_GUARDRAILS.md`
- TTL suggestion: 24h, or until run complete / new turn / wallet session ends

### Checkpoint payload (minimal serialize)

**Render Safe:** `levelId`, score, timer, positions, encounter/investigation state, objective flags, `livesRemaining`

**Bomb Suit Man:** `levelId`, `difficulty`, score, time, player state, minimal enemy/projectile state, progress flags, `hearts` at death

---

## Render Safe (RSP / direct action)

### Target life rules

- **`run_start` (1 credit)** → enter mission with **3 lives** (pinball-style)
- **Turn-ending mistake** (`mission_failed`, `player_killed`) → **−1 life**, auto-checkpoint:
  - **Lives 1–2 remaining:** feedback → reload checkpoint → **no extra credit**
  - **Lives = 0:** run suspended → paid continue or new game
- **Soft feedback** (`RenderSafeFeedbackModal` “Continue” that does not end the turn) → **free**, no life lost

### When 3 lives are gone

| Option | Cost | Behavior |
|--------|------|----------|
| **Continue** | 1 (`continue_checkpoint`) | Last checkpoint + **3 lives** refilled, same mission progress |
| **New game** | 1 (`run_start` / `new_turn`) | Level start, **3 lives**, run/score reset for that attempt |

### HUD

Show pinball-style life counter during play.

---

## Bomb Suit Man

### Target turn rules (hearts unchanged during play)

- **`run_start` (1 credit)** → start level with **5 hearts** (`MAX_HEARTS` — current behavior)
- Heart damage works as today until **hearts = 0**
- **Hearts = 0** → auto-checkpoint → run suspended

### When hearts expire

| Option | Cost | Behavior |
|--------|------|----------|
| **Continue** | 1 (`continue_checkpoint`) | Death checkpoint — same position, score, level progress — **hearts refilled to 5** |
| **New turn** | 1 (`new_turn`) | Level **restart from beginning**, **5 hearts**, run progress/score reset |

### Game over UI

Replace free “Play Again” with paid **Continue** vs **New turn**, plus back navigation.

---

## Side-by-side summary

| | **Render Safe** | **Bomb Suit Man** |
|--|-----------------|-------------------|
| **Per paid run** | 3 lives | 5 hearts |
| **Free failure handling** | Lose life → checkpoint if lives remain | Hearts drain until 0 |
| **Turn ends when** | 3 lives exhausted | Hearts = 0 |
| **Continue (1 credit)** | Checkpoint + **3 lives** | Checkpoint + **5 hearts** |
| **Fresh attempt (1 credit)** | **New game** — level start + 3 lives | **New turn** — level start + 5 hearts |
| **Initial start** | 1 credit | 1 credit |

---

## Server API (proposed)

### `GET /api/arcade/balance`

Returns daily + purchased remaining, `resets_at_et`, wallet owner resolution for current user.

### `POST /api/arcade/spend`

```json
{
  "action": "run_start | continue_checkpoint | new_turn",
  "game_id": "render_safe | rainbow_cowboy",
  "level_id": "...",
  "idempotency_key": "..."
}
```

Response:

```json
{
  "session_id": "uuid",
  "action": "...",
  "lives_or_hearts_grant": 3,
  "daily_remaining": 7,
  "purchased_remaining": 0,
  "resets_at_et": "..."
}
```

Use Postgres RPC with row lock on wallet for atomic grant + spend. Idempotency key prevents double-tap charges.

---

## UI

### `ArcadeCreditsHeader` (all arcade routes)

```
[ Avatar ]                         [ 🪙 7 / 10 ▼ ]
  top left                            top right (clickable)
```

Mount on: `/games`, `/games/bomb-suit-man`, `/render-safe`, in-game immersive surfaces.

### `ArcadeCreditsModal` (balance tap)

- Current balance + “Resets 12:01 AM ET”
- **Purchase packages** (Stripe — in scope for v1 per product)
- Placeholder for future “Watch ad for 1 credit”

### `ArcadeOutOfCreditsModal` (hard block)

- *“Come back tomorrow for your next 10”*
- **[ Purchase more credits now ]**
- Later: **[ Watch ad ]**

---

## Billing (purchase packages)

Tap balance → modal → Stripe **one-time payment** (`mode: "payment"`).

Webhook metadata:

- `billing_subject: "arcade_credits"`
- `wallet_user_id`, `credit_amount`, `package_id`

Fulfillment: idempotent ledger `purchase` → `purchased_remaining += amount`.

Reuse `profiles.stripe_customer_id` and multi-subject webhook pattern from business org billing.

Example packages (pricing TBD):

| Package | Credits |
|---------|---------|
| Starter | 10 |
| Value | 30 |
| Bulk | 100 |

---

## Ads (future)

- Ledger reason: `ad_reward`, delta +1
- Entry: out-of-credits modal
- Requires ad completion verification + daily cap on ad earns (TBD)

---

## Tier config (extensible)

```ts
ARCADE_DAILY_ALLOWANCE = {
  member: 10,
  employer: 10,        // same pool via wallet linking
  business_org: 10,    // same pool via owner_user_id
}
```

---

## Implementation phases

### Phase 1 — Wallet + header + hard block + purchase

- Migration: `arcade_wallets`, `arcade_credit_ledger`
- RPCs: wallet resolve, daily grant, spend
- API: balance + spend
- `ArcadeCreditsHeader`, out-of-credits modal, purchase modal + Stripe

### Phase 2 — Render Safe lives + checkpoints

- 3-life HUD; life loss on hard failures only
- Auto-checkpoint; free resume while lives remain
- Paid continue / new game when lives = 0

### Phase 3 — Bomb Suit Man checkpoints

- Auto-checkpoint on heart depletion
- Continue vs New turn (both 1 credit)
- Engine snapshot serialize/deserialize

### Phase 4 — Ads

- Ad provider + `ad_reward` grant

### Phase 5 — Public launch

- Relax/remove founder preview gate
- Optional tier-based daily allowances

---

## Codebase integration points

| Area | File(s) |
|------|---------|
| Hub | `app/games/page.tsx`, `app/games/layout.tsx` |
| Render Safe | `app/components/render-safe/RenderSafePage.tsx`, `RenderSafeGame.tsx` |
| Bomb Suit Man | `app/components/games/rainbow-cowboy/RainbowCowboyPage.tsx`, `rainbowCowboyEngine.ts` |
| Access (beta) | `app/components/games/RequireArcadePreview.tsx` |
| Linked accounts | `app/api/linked-auth-accounts/route.ts`, `business_organization_pages` |
| Cost guardrails | `GAME_COST_GUARDRAILS.md` |
| New (proposed) | `app/lib/arcadeCredits.ts`, `app/lib/server/arcadeWallet.ts`, `app/components/games/ArcadeCreditsHeader.tsx`, `app/components/games/ArcadeCreditsModal.tsx`, `app/api/arcade/*` |

---

## Open product decisions

1. **Purchased credits cap** — unlimited vs max (e.g. 500)?
2. **Ad earn limit** — max credits/day from ads?
3. **Balance display** — `7/10 daily (+12 bought)` vs single total?
4. **Founder beta allowance** — real 10/day vs unlimited for testing?
5. **Render Safe soft warnings** — confirm only hard failures cost a life.
6. **Victory → next level** — confirm 1 credit per new level start.

---

## Related branch

Posting-as-identity work lives on **`cursor/posting-features-f1d0`** (separate PR). This arcade spec is independent.
