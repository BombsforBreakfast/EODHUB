/** Cross-tree open for Collapsing Circuit composer (nav + ↔ feed strip). */

export const CIRCUIT_COMPOSE_EVENT = "eod:circuit-compose";
export const CIRCUIT_COMPOSE_QUERY = "compose";

export type CircuitComposeDetail = {
  mode?: "media" | "thought";
};

export function requestCircuitCompose(detail: CircuitComposeDetail = {}): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  const onFeed = path === "/" || path === "";
  if (onFeed) {
    window.dispatchEvent(new CustomEvent(CIRCUIT_COMPOSE_EVENT, { detail }));
    return;
  }
  const url = new URL("/", window.location.origin);
  url.searchParams.set("circuit", CIRCUIT_COMPOSE_QUERY);
  window.location.assign(url.toString());
}

export function onCircuitComposeRequest(
  handler: (detail: CircuitComposeDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CircuitComposeDetail>).detail ?? {};
    handler(detail);
  };
  window.addEventListener(CIRCUIT_COMPOSE_EVENT, listener);
  return () => window.removeEventListener(CIRCUIT_COMPOSE_EVENT, listener);
}
