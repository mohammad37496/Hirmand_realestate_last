/**
 * Origin guard for TanStack server functions.
 *
 * Kept in its own module so the h3-based admin routes never pull in the
 * request-context import, and every `requireAdmin()` gets the same check with
 * one call instead of repeating the header plumbing.
 */

import { getRequestHeaders } from "@tanstack/react-start/server";
import { assertServerFnSameOrigin } from "./admin-rate-limit.server.ts";

export function assertAdminServerFnOrigin() {
  assertAdminServerFnOriginFromHeaders(getRequestHeaders());
}

/** Kept separately so the real Headers contract can be regression-tested. */
export function assertAdminServerFnOriginFromHeaders(headers: Pick<Headers, "get">) {
  assertServerFnSameOrigin((name) => headers.get(name) ?? null);
}
