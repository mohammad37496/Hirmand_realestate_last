const RETURN_PATH_ORIGIN = "https://hirmandrealestate.ir";

/** Keep login callbacks on the Hirmand origin, including WHATWG backslash normalization. */
/** @param {unknown} value @returns {string} */
export function getSafeLoginReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/favorites";
  }

  try {
    const target = new URL(value, RETURN_PATH_ORIGIN);
    if (target.origin !== RETURN_PATH_ORIGIN) return "/favorites";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/favorites";
  }
}
