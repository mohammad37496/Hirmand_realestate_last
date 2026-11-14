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

/** A later successful load or explicit retry makes this entry eligible again. */
export function clearMediaFailure(failedIndexes: Set<number>, index: number): void {
  failedIndexes.delete(index);
}
