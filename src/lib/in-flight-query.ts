/** Deduplicate identical pending queries while allowing different keys in parallel. */
export function getOrCreateInFlight<K, V>(
  requests: Map<K, Promise<V>>,
  key: K,
  create: () => Promise<V> | V,
): Promise<V> {
  const existing = requests.get(key);
  if (existing) return existing;

  const request = Promise.resolve().then(create);
  requests.set(key, request);

  // Attach cleanup without replacing the promise shared by all callers.
  // The extra catch handles the promise returned by finally when request rejects.
  void request
    .finally(() => {
      if (requests.get(key) === request) requests.delete(key);
    })
    .catch(() => undefined);

  return request;
}
