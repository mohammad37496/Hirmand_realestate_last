export const TRACKING_TOKEN_MAX_LENGTH = 39;

const PUBLIC_TRACKING_TOKEN_PATTERN = /^HIR-\d{2}-(?:[A-F0-9]{12}|[A-F0-9]{32})$/;
const PARTNER_TRACKING_CODE_PATTERN = /^HIR-\d{2}-(?:[A-F0-9]{8}|[A-F0-9]{32})$/;

/** Accepts existing 48-bit tokens and newly issued 128-bit public tokens. */
export function isValidPublicTrackingToken(value: string) {
  return PUBLIC_TRACKING_TOKEN_PATTERN.test(value);
}

/** Accepts existing 32-bit partner codes and newly issued 128-bit codes. */
export function isValidPartnerTrackingCode(value: string) {
  return PARTNER_TRACKING_CODE_PATTERN.test(value);
}
