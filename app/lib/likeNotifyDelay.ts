/** Delay before sending “someone liked X” notifications so accidental likes can be undone. */
export const LIKE_NOTIFY_DELAY_MS = 5000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDelayedLikeNotify(key: string, send: () => void | Promise<unknown>): void {
  cancelDelayedLikeNotify(key);
  const id = setTimeout(() => {
    timers.delete(key);
    void Promise.resolve(send()).catch((err) => {
      console.warn("[delayedLikeNotify]", err);
    });
  }, LIKE_NOTIFY_DELAY_MS);
  timers.set(key, id);
}

export function cancelDelayedLikeNotify(key: string): void {
  const t = timers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    timers.delete(key);
  }
}
