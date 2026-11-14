/** Record one exhausted image and ignore duplicate failures from the same render. */
export function recordMediaFailure(
  images: readonly string[],
  failedIndexes: Set<number>,
  failedIndex: number,
): boolean {
  if (
    !Number.isInteger(failedIndex) ||
    failedIndex < 0 ||
    failedIndex >= images.length ||
    !images[failedIndex]?.trim() ||
    failedIndexes.has(failedIndex)
  ) {
    return false;
  }

  failedIndexes.add(failedIndex);
  return true;
}

/** Find the next non-empty media item that has not exhausted its sources. */
export function nextUnfailedMediaIndex(
  images: readonly string[],
  failedIndexes: ReadonlySet<number>,
  currentIndex: number,
): number | null {
  if (
    !Number.isInteger(currentIndex) ||
    currentIndex < 0 ||
    currentIndex >= images.length
  ) {
    return null;
  }

  for (let offset = 1; offset < images.length; offset += 1) {
    const candidate = (currentIndex + offset) % images.length;
    if (images[candidate]?.trim() && !failedIndexes.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** A later successful load or explicit retry makes this entry eligible again. */
export function clearMediaFailure(failedIndexes: Set<number>, index: number): void {
  failedIndexes.delete(index);
}
