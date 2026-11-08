/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled for customer accounts. The Better Auth server reads this flag and
 * exposes its same-origin email/password sign-up and sign-in endpoints.
 *
 * The Better Auth server enables this option when constructing its auth instance.
 */
export const emailAndPasswordEnabled = true;
