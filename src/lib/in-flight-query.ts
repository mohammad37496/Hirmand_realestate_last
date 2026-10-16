/** Deduplicate identical pending queries while allowing different keys in parallel. */
export function getOrCreateInFlight<K, V>(
  requests: Map<K, Promise<V>>,
  key: K,
  create: () => Promise<V> | V,
): Promise<V> {
  const existing = requests.get(key);
  if (existing) return existing;

  let request!: Promise<V>;
  request = Promise.resolve()
    .then(create)
    .finally(() => {
      // Do not delete a newer request if the same key was replaced meanwhile.
      if (requests.get(key) === request) requests.delete(key);
    });
  requests.set(key, request);
  return request;
}
