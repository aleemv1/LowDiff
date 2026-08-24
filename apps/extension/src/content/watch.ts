/**
 * Runs a check on a slow interval instead of via MutationObserver.
 *
 * GitHub's diff view re-renders constantly, and anything we do to the page —
 * injecting a badge, setting a style — is itself a mutation. An observer
 * watching the document therefore re-triggers its own callback, and the tab
 * locks up. Polling cannot feed back into itself, and at this cadence the cost
 * is a couple of selector queries per second.
 */
export function watch(check: () => void, intervalMs = 700): () => void {
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    try {
      check();
    } catch (error) {
      console.warn('[LowDiff] watch callback failed', error);
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Catch up promptly after the user navigates or scrolls new rows into view.
  const onActivity = () => tick();
  window.addEventListener('popstate', onActivity);
  window.addEventListener('scrollend', onActivity);
  tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('popstate', onActivity);
    window.removeEventListener('scrollend', onActivity);
  };
}
