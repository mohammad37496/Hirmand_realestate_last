/**
 * @param {unknown} target
 * @param {boolean} defaultPrevented
 */
export function shouldHandleGalleryArrowKey(target, defaultPrevented = false) {
  if (defaultPrevented) return false;
  if (!target || typeof target !== "object") return true;

  /** @type {{ tagName?: unknown; isContentEditable?: unknown; closest?: (selector: string) => unknown }} */
  const element = target;
  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (["input", "textarea", "select"].includes(tagName) || element.isContentEditable === true) return false;
  if (typeof element.closest === "function" && element.closest("input, textarea, select, [contenteditable='true'], [role='slider']")) return false;
  return true;
}
