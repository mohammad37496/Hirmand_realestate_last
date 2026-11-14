import { isPropertyFallbackImage } from "./property-fallback-images.ts";

export const PROPERTY_CARD_IMAGE_LIMIT = 4;

export type PropertyCardImageState = {
  sourceIndex: number;
  candidateIndex: number;
  legacyMode: boolean;
  failed: boolean;
};

export function selectPropertyCardImages(
  images: readonly unknown[] | undefined,
  primaryImage?: unknown,
): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];

  for (const candidate of [...(images ?? []), primaryImage]) {
    if (typeof candidate !== "string") continue;
    const source = candidate.trim();
    if (!source || seen.has(source) || isPropertyFallbackImage(source)) continue;
    seen.add(source);
    selected.push(source);
    if (selected.length >= PROPERTY_CARD_IMAGE_LIMIT) break;
  }

  return selected;
}

export function advancePropertyCardImageFailure(
  state: PropertyCardImageState,
  options: {
    sourceCount: number;
    candidateCount: number;
    usingLocalFallback: boolean;
    hasLegacyFallback: boolean;
  },
): PropertyCardImageState {
  if (state.failed) return state;

  if (options.usingLocalFallback) {
    if (!state.legacyMode && options.hasLegacyFallback) {
      return { ...state, legacyMode: true };
    }
    return { ...state, failed: true };
  }

  if (state.candidateIndex < options.candidateCount - 1) {
    return { ...state, candidateIndex: state.candidateIndex + 1, legacyMode: false };
  }

  if (state.sourceIndex < options.sourceCount) {
    return {
      ...state,
      sourceIndex: state.sourceIndex + 1,
      candidateIndex: 0,
      legacyMode: false,
    };
  }

  return { ...state, failed: true };
}
