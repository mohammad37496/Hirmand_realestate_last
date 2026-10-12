/**
 * Origin guard for TanStack server functions.
 *
 * Kept in its own module so the h3-based admin routes never pull in the
 * request-context import, and every `requireAdmin()` gets the same check with
 * one call instead of repeating the header plumbing.
 */

import { getRequestHeaders } from "@tanstack/react-start/server";
import { assertServerFnSameOrigin } from "@/lib/admin-rate-limit.server";

export function assertAdminServerFnOrigin() {
  const headers = getRequestHeaders();
  assertServerFnSameOrigin((name) => {
    const record = headers as unknown as Record<string, string | undefined>;
    return record[name] ?? record[name.toLowerCase()] ?? null;
  });
}
