/**
 * Fire-and-forget client hook after signInWithPassword / session creation.
 * Never throws; never blocks navigation.
 */
export function clearFailedAuthReportsAfterLogin(
  accessToken: string | null | undefined,
): void {
  if (!accessToken) return;

  try {
    void fetch("/api/auth/clear-failed-reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Clearing triage entries must never affect auth UX.
  }
}
