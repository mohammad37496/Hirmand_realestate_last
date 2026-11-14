/** Stateless admin JWTs are a local/development fallback only. */
export function shouldRejectStatelessAdminSession(
  databaseConfigured: boolean,
  productionRuntime: boolean,
): boolean {
  return !databaseConfigured && productionRuntime;
}
