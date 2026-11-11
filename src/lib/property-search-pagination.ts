type RequestIdRef = { current: number };
type LoadingMoreSetter = (loading: boolean) => void;

/** Release the previous page-request lock when a new query takes ownership. */
export function resetPropertySearchPaginationLock(setLoadingMore: LoadingMoreSetter) {
  setLoadingMore(false);
}

/** A stale page request must not release a lock owned by a newer query. */
export function finishPropertyLoadMore(
  requestId: RequestIdRef,
  queryVersion: number,
  setLoadingMore: LoadingMoreSetter,
) {
  if (requestId.current === queryVersion) setLoadingMore(false);
}