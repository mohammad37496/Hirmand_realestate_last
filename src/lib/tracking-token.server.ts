import { randomBytes } from "node:crypto";
import { isValidPublicTrackingToken } from "./tracking-token.ts";

type TrackingTokenSql = {
  query<T>(statement: string, parameters?: unknown[]): Promise<T[]>;
};

function trackingYear(date: Date) {
  return String(date.getFullYear()).slice(-2);
}

export function generatePublicTrackingToken(date = new Date()) {
  return `HIR-${trackingYear(date)}-${randomBytes(16).toString("hex").toUpperCase()}`;
}

export function generatePartnerTrackingCode(date = new Date()) {
  return `HIR-${trackingYear(date)}-${randomBytes(16).toString("hex").toUpperCase()}`;
}

/** Atomically assigns a public token to a legacy duplicate lead and returns the stored winner. */
export async function ensurePublicTrackingToken(sql: TrackingTokenSql, leadId: string, existingToken: string | null | undefined) {
  if (existingToken && isValidPublicTrackingToken(existingToken)) return existingToken;
  const generated = generatePublicTrackingToken();
  const rows = await sql.query<{ publicTrackingToken: string }>(
    "update leads set public_tracking_token=case when public_tracking_token ~* '^HIR-[0-9]{2}-([A-F0-9]{12}|[A-F0-9]{32})$' then public_tracking_token else $2 end where id=$1 returning public_tracking_token as \"publicTrackingToken\"",
    [leadId, generated],
  );
  const stored = rows[0]?.publicTrackingToken;
  if (!stored) throw new Error("Could not assign a public tracking token to the existing lead.");
  return stored;
}
