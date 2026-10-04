/** Let a filter replacement finish before a navigation pushes another entry. */
let pendingFilters: Promise<URLSearchParams> | null = null;

export function trackFilterUpdate(update: Promise<URLSearchParams>): void {
  pendingFilters = update;
  const clear = () => {
    if (pendingFilters === update) pendingFilters = null;
  };
  void update.then(clear, clear);
}

export function afterFilterUpdate(navigate: () => void): void {
  if (!pendingFilters) {
    navigate();
    return;
  }
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  // Back/Forward cancels an intent that has not reached the URL yet.
  window.addEventListener("popstate", cancel, { once: true });
  const cleanup = () => window.removeEventListener("popstate", cancel);
  void pendingFilters.then(() => {
    cleanup();
    if (!cancelled) navigate();
  }, cleanup);
}
