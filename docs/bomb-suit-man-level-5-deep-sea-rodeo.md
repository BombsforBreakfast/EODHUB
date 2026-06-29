# Bomb Suit Man — Level 5: Deep Sea Rodeo

**Campaign base:** Camp Poseidon (unlocked after beating The Hive / FOB Thunder secured)  
**Playable character:** Frogman (new) — dark blue EOD diver, horizontal swim pose  
**Play mode:** 4-direction swim (no jump/gravity)  
**Art:** 8/16-bit procedural canvas (same engine as levels 1–4)

---

## Story hook

The Hive is cleared. Camp Poseidon opens underwater — Frogman takes point through a minefield toward the sunken extraction gate.

---

## HUD (retro arcade)

```
HEARTS █████   SPEARS: 3   RAINBOW: 2   SCORE 0123456          TIME 02:45
                    BOMB SUIT MAN — LEVEL 5: DEEP SEA RODEO · PLAY AS FROGMAN!
```

| Stat | Value |
|------|-------|
| Hearts | 5 max |
| Spear gun | 3 shots, auto-reload 1.5s after empty |
| Rainbow blast | Same as prior levels (clears mines in radius) |
| Target time | ~4 min for fast-time bonus |

---

## Frogman

- **Look:** Dark navy wetsuit, yellow mask band, horizontal swim animation, spear gun pointed forward
- **Move:** Up / Down / Left / Right at equal swim speed (diagonal normalized)
- **Bounds:** Y between water surface (~140) and seafloor (460)
- **Attack:** Spear projectile (gun / tongue button), horizontal in facing direction
- **No:** Jump, duck, tongue grab, or robot/unicorn ride on this level

---

## Sea mines

Two variants — both destructible, both dangerous up close.

| Type | Behavior |
|------|----------|
| **Tethered** | Fixed X; chain down to seafloor; height varies (low / mid / high) |
| **Floating** | Drifts vertically (sine bob ±24px) |

| Interaction | Result |
|-------------|--------|
| Spear hit | Mine destroyed, +75 score, blast VFX (hurts if player in blast radius) |
| Proximity (<50px) | Detonation, 1 heart, knockback |
| Rainbow blast | Clears mines in radius |

**Blast radius:** ~90px — stay back when shooting.

---

## Level layout (side-scroll, ~11k px)

```
START ───────────────────────────────────────────────────────────────► EXIT (stone arch)
  ~0        ~2k          ~4k              ~6k           ~8k        ~10.5k

[open]   [tethered      [sunken boat      [floating      [plank      [BOSS GATE
 water]    mine rows]     wreck walls]     mine corridor]  maze]       / extract]

  o───o     ╱╲  ╱╲         ┌──hull──┐        ↕ ↕ ↕         ║ ║ ║       ⌒⌒⌒
 frogman   chain mines    │ decks  │       bob mines     planks     arch exit
```

### Section 1 — Open water (0–1800)
- Tutorial density: 3 tethered mines at staggered heights
- 1 range beer pickup

### Section 2 — Tethered field (1800–4200)
- Two rows of tethered mines (floor / mid / high)
- Wooden plank wall choke at ~3200

### Section 3 — Sunken boat wreck (4200–6500)
- Large hull walls (platforms + vertical walls)
- Mines tucked inside wreck gaps
- Rainbow pickup mid-wreck

### Section 4 — Floating corridor (6500–8500)
- 6–8 bobbing mines, narrow vertical lane
- White energy drink + nicotine pouch

### Section 5 — Plank maze → exit (8500–10500)
- Plank walls forcing zigzag
- Final tethered pair before extraction arch
- Unicorn treat optional reward before gate

**Extraction:** Underwater stone arch at `extractionX = 10200`  
**Victory banner:** `DEEP SEA RODEO CLEARED`

---

## Power-ups (unchanged icons)

| Pickup | Effect |
|--------|--------|
| Range Beer | +1 heart |
| White Monster | Clear gassed status |
| Zyn Tin | +2 hearts |
| Rainbow | +1 rainbow charge |
| Unicorn Treat | Rampage (brief invincibility + speed) |

---

## Scoring bonuses

| Event | Points |
|-------|--------|
| Sea mine destroyed | +75 |
| Level complete | +1500 |
| No damage | +750 |
| Under target time | time bonus |

---

## Ranks (level-5)

| Score | Rank |
|-------|------|
| 4500+ | Depth Charge |
| 3500+ | Mine Whisperer |
| 2500+ | Frogman |
| 1500+ | Bubble Rider |
| else | Guppy |

---

## Engine flags (implementation)

```ts
// rainbowCowboyLevel5.ts
theme: "deep_sea"
playMode: "swim"
character: "frogman"
level.id: "level-5"
campaignBase: "camp_poseidon"
```

Unlock: `isFobThunderSecured(progress)` — same as existing level-5 gate.

---

## Cursor prompt (copy-paste for future edits)

> Level 5 Deep Sea Rodeo: swim mode Frogman, spear gun (3 ammo, 1.5s reload), sea mines tethered/floating, underwater 8-bit theme, sunken boat wreck obstacles, extraction arch at end. No drones. Maintain `rainbowCowboyEngine` + `LevelConfig` pattern from levels 2–3.
