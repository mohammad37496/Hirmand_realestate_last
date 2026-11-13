export type PropertyWatchTargetType = "price" | "deposit" | "rent";

export type PropertyWatchTargetMutationPayload = {
  ok?: boolean;
  enabled?: boolean;
  target?: { type?: string; amount?: number | null } | null;
};

export function isPropertyWatchTargetMutationSuccessful(
  payload: PropertyWatchTargetMutationPayload | null,
  expected: { type: PropertyWatchTargetType; amount: number | null },
) {
  if (payload?.ok !== true || payload.enabled !== true) return false;
  if (expected.amount === null) return payload.target === null;
  return Boolean(
    payload.target &&
      payload.target.type === expected.type &&
      typeof payload.target.amount === "number" &&
      Number.isFinite(payload.target.amount) &&
      payload.target.amount === expected.amount,
  );
}
