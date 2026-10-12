import { defineEventHandler, getHeader } from "h3";

/**
 * Platform health check endpoint.
 *
 * Kept cheap and decoupled from the database so the platform health checker does
 * not sit on a DB connection (or a slow DDL migration) during boot. If you want
 * the health semantics to include DB reachability, lean on the already-running
 * runtime check in `scripts/check-runtime-db.mjs` at deploy time instead of
 * making every liveness poll do it.
 */
export default defineEventHandler(() => {
  // Signal a real HTTP listener is up. The deployed app is served by Nitro's
  // node-server preset, so a 200 here means the process has bound the port and
  // is accepting requests.
  return {
    status: "ok",
    service: "hirmand-real-estate",
    timestamp: new Date().toISOString(),
  };
});

export const onRequest = [
  // Ignore platform health probes in admin rate-limit / audit paths.
  () => {},
];
