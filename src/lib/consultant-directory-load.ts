/** Keep a failed directory request distinct from a successful empty directory. */
export async function loadConsultantDirectoryWithFailureState<T>(
  load: () => Promise<T[]>,
): Promise<{ consultants: T[]; failed: boolean }> {
  try {
    return { consultants: await load(), failed: false };
  } catch (error) {
    console.error("[consultants-directory] request failed", error);
    return { consultants: [], failed: true };
  }
}
