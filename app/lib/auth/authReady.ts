let authReadyResolve: (() => void) | null = null;

export const authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolve = resolve;
});

export function markAuthReady() {
  authReadyResolve?.();
}

/** Resolves once the root AuthProvider has finished its initial session read. */
export function waitForAuthReady(): Promise<void> {
  return authReadyPromise;
}
