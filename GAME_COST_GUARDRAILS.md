# Game Cost Guardrails

Production expectations for the arcade/games feature. Gameplay should stay client-side; Supabase and Vercel calls are limited to access checks, page-open data, leaderboard reads, and final score persistence.

## Unicorn Hero / Rainbow Cowboy

Expected calls for an authenticated, unlocked player:

- Route entry: one `/api/arcade/access` request while arcade preview gating is enabled.
- Page load: two Supabase reads in parallel from `rainbow_cowboy_completions` and `rainbow_cowboy_high_scores`, served from a 60-second user-scoped session cache on repeat arcade visits.
- Leaderboards: one RPC per playable level on first select-screen view, served from a short in-memory cache on return.
- Start game: zero network calls.
- During gameplay: zero network calls.
- Game over without completion: zero network calls.
- Victory completion: one Supabase RPC, `record_rainbow_cowboy_run`, which idempotently records completion and personal best.

Realtime is not used. Supabase Storage image transformations are not used for game assets or leaderboard avatars.

## Render Safe

Expected calls for an authenticated, unlocked player:

- Route entry: one `/api/arcade/access` request while arcade preview gating is enabled.
- Page load: one Supabase RPC, `get_render_safe_personal_bests`, for all level personal bests, served from a 60-second user-scoped session cache on repeat arcade visits.
- Leaderboards: one RPC per playable level on first select-screen view, served from a short in-memory cache on return.
- Start game: zero network calls.
- During gameplay: zero network calls.
- Game over/completion: existing personal-best save path reads the current level best and writes only if the score improves.

Realtime is not used. Supabase Storage image transformations are not used for game assets or leaderboard avatars.

## Assets And Runtime

- Non-arcade site routes should not import game runtime modules. The global nav only imports the lightweight `canClickArcadeNav` boolean helper for link visibility.
- Game route pages lazy-load their heavier game page modules, and `RainbowCowboyGame` itself is lazy-loaded client-side from the Rainbow Cowboy page.
- Arcade preview access responses are cached in session storage for 2 minutes per user. The server-side password cookie remains the source of truth; the cache only avoids repeated route-entry checks during the same browser session.
- Unicorn Hero uses canvas/procedural drawing and Web Audio oscillators/noise. It does not load remote sprites, music, or Supabase Storage assets.
- Render Safe uses local/client game code and existing UI assets. It does not use remote transformed assets for gameplay.
- Game loops use `requestAnimationFrame` and should not call Supabase, Vercel API routes, analytics, or logging from animation frames, physics ticks, collision handlers, or input handlers.
- Unicorn Hero pauses simulation and music while the tab is hidden, and cleans up animation frames, listeners, intervals, and audio context on unmount.

## Database Growth

- `rainbow_cowboy_high_scores`: bounded to one row per user per level.
- `rainbow_cowboy_completions`: bounded to one row per user per level per difficulty.
- `render_safe_high_scores`: bounded to one row per user per level.
- Leaderboard RPCs cap results server-side.

## Developer Warnings

- Rainbow Cowboy tracks remote completion writes per mounted play session in development and warns if more than one write is attempted for a single run.
- Routine Supabase image transformations are hard-disabled in `app/lib/storageImageUrl.ts`; display helpers warn in development if a transformed URL reaches avatars, feed media, or gallery media.
- Run `npm run check:image-transforms` before deploys that touch media handling to catch new render/image URLs or transform helper calls in source.

## Remaining Risks

- Preview-gated arcade routes still invoke `/api/arcade/access` on route entry. This is outside gameplay and should be removed or simplified when arcade preview gating is no longer needed.
- Scores are still client-submitted. RLS and uniqueness constraints limit table growth, but this is not anti-cheat. If public leaderboards become competitive, move all score submission behind a server-validated session API.
- Render Safe completion persistence still uses the older read-then-write pattern. It is bounded and only runs at completion, but could be collapsed into an RPC later if Render Safe traffic grows.
