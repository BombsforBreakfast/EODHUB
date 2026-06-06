export const NEAR_BOTTOM_THRESHOLD_PX = 80;

/** True when the scroll container is already at or near the bottom. */
export function isNearBottom(
  container: HTMLElement | null,
  thresholdPx = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  if (!container) return true;
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance <= thresholdPx;
}

export type ScrollMessagesOptions = {
  /** Scroll even when the user has scrolled up to read history. */
  force?: boolean;
  thresholdPx?: number;
};

/** Scroll a message list to the bottom when forced or already near the bottom. */
export function scrollMessagesToBottom(
  container: HTMLElement | null,
  options: ScrollMessagesOptions = {},
): void {
  if (!container) return;
  const { force = false, thresholdPx = NEAR_BOTTOM_THRESHOLD_PX } = options;
  if (!force && !isNearBottom(container, thresholdPx)) return;

  requestAnimationFrame(() => {
    if (!container) return;
    if (!force && !isNearBottom(container, thresholdPx)) return;
    container.scrollTop = container.scrollHeight;
  });
}
