import { supabase } from "@/app/lib/lib/supabaseClient";

export type ArcadeWallet = {
  balance: number;
  dailyMax: number;
  grantDate: string;
};

export const ARCADE_UNLIMITED_COIN_BALANCE = 999999;

export function createUnlimitedArcadeWallet(): ArcadeWallet {
  return {
    balance: ARCADE_UNLIMITED_COIN_BALANCE,
    dailyMax: ARCADE_UNLIMITED_COIN_BALANCE,
    grantDate: new Date().toISOString().slice(0, 10),
  };
}

export function isArcadeWalletUnlimited(wallet: ArcadeWallet | null): boolean {
  return (
    wallet != null &&
    wallet.balance >= ARCADE_UNLIMITED_COIN_BALANCE &&
    wallet.dailyMax >= ARCADE_UNLIMITED_COIN_BALANCE
  );
}

export type SpendChallengeCoinResult =
  | { ok: true; wallet: ArcadeWallet }
  | { ok: false; wallet: ArcadeWallet | null; error: string };

const WALLET_CACHE_TTL_MS = 60 * 1000;

function walletCacheKey(userId: string): string {
  return `arcade-wallet:${userId}`;
}

function readCachedWallet(userId: string): ArcadeWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(walletCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArcadeWallet & { expiresAt?: number };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(walletCacheKey(userId));
      return null;
    }
    return {
      balance: parsed.balance,
      dailyMax: parsed.dailyMax,
      grantDate: parsed.grantDate,
    };
  } catch {
    return null;
  }
}

function cacheWallet(userId: string, wallet: ArcadeWallet): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      walletCacheKey(userId),
      JSON.stringify({ ...wallet, expiresAt: Date.now() + WALLET_CACHE_TTL_MS }),
    );
  } catch {
    // ignore
  }
}

export function clearArcadeWalletCache(userId: string | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(walletCacheKey(userId));
  } catch {
    // ignore
  }
}

function mapWalletRow(row: { balance: number; daily_max: number; grant_date: string }): ArcadeWallet {
  return {
    balance: row.balance,
    dailyMax: row.daily_max,
    grantDate: row.grant_date,
  };
}

export async function loadArcadeWallet(
  userId: string | null,
  options?: { bypassCache?: boolean },
): Promise<ArcadeWallet | null> {
  if (!userId) return null;

  if (!options?.bypassCache) {
    const cached = readCachedWallet(userId);
    if (cached) return cached;
  }

  const { data, error } = await supabase.rpc("get_arcade_wallet");
  if (error) {
    console.error("Failed to load arcade wallet:", error);
    return null;
  }

  const row = ((data as { balance: number; daily_max: number; grant_date: string }[] | null) ?? [])[0];
  if (!row) return null;

  const wallet = mapWalletRow(row);
  cacheWallet(userId, wallet);
  return wallet;
}

export async function spendArcadeChallengeCoin(
  userId: string | null,
  gameId: "rainbow_cowboy" | "render_safe",
  levelId: string,
): Promise<SpendChallengeCoinResult> {
  if (!userId) {
    return { ok: false, wallet: null, error: "Sign in required." };
  }

  clearArcadeWalletCache(userId);

  const { data, error } = await supabase.rpc("spend_arcade_challenge_coin", {
    p_game_id: gameId,
    p_level_id: levelId,
  });

  if (error) {
    console.error(
      "Failed to spend challenge coin:",
      error.message,
      error.code,
      error.details,
      error.hint,
    );
    return { ok: false, wallet: null, error: "Could not start play. Try again." };
  }

  const row = ((data as { balance: number; daily_max: number; spent: boolean }[] | null) ?? [])[0];
  if (!row) {
    return { ok: false, wallet: null, error: "Could not start play. Try again." };
  }

  const wallet: ArcadeWallet = {
    balance: row.balance,
    dailyMax: row.daily_max,
    grantDate: new Date().toISOString().slice(0, 10),
  };

  if (!row.spent) {
    cacheWallet(userId, wallet);
    return {
      ok: false,
      wallet,
      error: "You're out of challenge coins for today. Come back tomorrow for 10 more.",
    };
  }

  cacheWallet(userId, wallet);
  return { ok: true, wallet };
}
