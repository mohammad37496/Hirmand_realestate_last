/**
 * Refresh a mounted favorites view when the account workspace is pulled from
 * the server. Repeated sync events with the same favorites do no extra work.
 * @param {{ target: EventTarget, initialSlugs: string[], readSlugs: () => string[], load: (slugs: string[]) => Promise<unknown>, onLoaded: (rows: unknown, slugs: string[]) => void, onLoading?: (loading: boolean) => void, onError?: (error: unknown) => void }} options
 */
export function subscribeToFavoriteWorkspaceSync({
  target,
  initialSlugs,
  readSlugs,
  load,
  onLoaded,
  onLoading,
  onError,
}) {
  let lastSlugs = [...initialSlugs];
  let requestId = 0;

  const onWorkspaceSynced = () => {
    const nextSlugs = readSlugs();
    if (nextSlugs.length === lastSlugs.length && nextSlugs.every((slug, index) => slug === lastSlugs[index])) return;

    const previousSlugs = lastSlugs;
    lastSlugs = nextSlugs;
    const currentRequest = ++requestId;
    if (!nextSlugs.length) {
      onLoaded([], nextSlugs);
      onLoading?.(false);
      return;
    }

    onLoading?.(true);
    void load(nextSlugs).then((rows) => {
      if (currentRequest === requestId) onLoaded(rows, nextSlugs);
    }).catch((error) => {
      if (currentRequest === requestId) {
        lastSlugs = previousSlugs;
        onError?.(error);
      }
    }).finally(() => {
      if (currentRequest === requestId) onLoading?.(false);
    });
  };

  target.addEventListener("hirmand:workspace-synced", onWorkspaceSynced);
  return () => {
    requestId += 1;
    target.removeEventListener("hirmand:workspace-synced", onWorkspaceSynced);
  };
}
