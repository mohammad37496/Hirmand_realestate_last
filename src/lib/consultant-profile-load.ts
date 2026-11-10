/** Keep a failed consultant-property request distinct from a successful empty result. */
export async function loadConsultantPropertiesWithFailureState<T>(
  load: () => Promise<T[]>,
): Promise<{ properties: T[]; failed: boolean }> {
  try {
    return { properties: await load(), failed: false };
  } catch (error) {
    console.error("[consultant-profile] listings loader failed", error);
    return { properties: [], failed: true };
  }
}
