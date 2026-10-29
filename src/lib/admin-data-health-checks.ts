export type AdminDataHealthCheck<T> = {
  name: string;
  run: () => Promise<T[]>;
};

export class AdminDataHealthCheckError extends Error {
  readonly failedChecks: string[];

  constructor(failedChecks: string[]) {
    super(`Admin data-health scan failed for: ${failedChecks.join(", ")}`);
    this.name = "AdminDataHealthCheckError";
    this.failedChecks = failedChecks;
  }
}

/** Return results only when every check completed, so a failed query cannot look healthy. */
export async function runAdminDataHealthChecks<T>(checks: readonly AdminDataHealthCheck<T>[]): Promise<T[][]> {
  const results = await Promise.all(checks.map(async (check) => {
    try {
      return { name: check.name, rows: await check.run(), failed: false };
    } catch (error) {
      console.error(`[admin-data-health] ${check.name} check failed`, error);
      return { name: check.name, rows: [] as T[], failed: true };
    }
  }));

  const failedChecks = results.filter((result) => result.failed).map((result) => result.name);
  if (failedChecks.length > 0) throw new AdminDataHealthCheckError(failedChecks);
  return results.map((result) => result.rows);
}
