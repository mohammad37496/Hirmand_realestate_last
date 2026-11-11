export type AdminDashboardOptionalQueryResult<T> = {
  section: string;
  data: T;
  available: boolean;
  timedOut: boolean;
};

function isTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === "57014"
    || code === "ETIMEDOUT"
    || code === "ESOCKETTIMEDOUT"
    || /timed?\s*out|timeout|statement timeout/i.test(error.message);
}

export async function loadAdminDashboardOptionalQuery<T>(
  section: string,
  query: Promise<T>,
  fallback: T,
): Promise<AdminDashboardOptionalQueryResult<T>> {
  try {
    return { section, data: await query, available: true, timedOut: false };
  } catch (error) {
    console.error(`[admin-dashboard] ${section} unavailable`, error);
    return { section, data: fallback, available: false, timedOut: isTimeout(error) };
  }
}
