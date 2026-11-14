export type MediaFailureResult =
  | { status: "ignored" }
  | { status: "advanced"; nextIndex: number | null };

/** Find the next gallery entry that has not exhausted its image candidates. */
export function nextUnfailedMediaIndex(
  images: readonly string[],
  failedIndexes: ReadonlySet<number>,
  currentIndex: number,
): number | null {
  if (images.length < 2) return null;

  for (let offset = 1; offset < images.length; offset += 1) {
    const index = (currentIndex + offset) % images.length;
    if (images[index]?.trim() && !failedIndexes.has(index)) return index;
  }

  return null;
}

/** Record one exhausted image and ignore duplicate failures from the same render. */
export function recordMediaFailure(
  images: readonly string[],
  failedIndexes: Set<number>,
  failedIndex: number,
): MediaFailureResult {
  if (
    !Number.isInteger(failedIndex) ||
    failedIndex < 0 ||
    failedIndex >= images.length ||
    !images[failedIndex]?.trim() ||
    failedIndexes.has(failedIndex)
  ) {
    return { status: "ignored" };
  }

  failedIndexes.add(failedIndex);
  return {
    status: "advanced",
    nextIndex: nextUnfailedMediaIndex(images, failedIndexes, failedIndex),
  };
}

/** A later successful load or explicit retry makes this entry eligible again. */
export function clearMediaFailure(failedIndexes: Set<number>, index: number): void {
  failedIndexes.delete(index);
}
