/**
 * @template T
 * @param {() => Promise<T[]>} load
 * @returns {Promise<{ status: "success", rows: T[] } | { status: "error" } >}
 */
export async function resolveCompareLoad(load) {
  try {
    return { status: "success", rows: await load() };
  } catch {
    return { status: "error" };
  }
}
