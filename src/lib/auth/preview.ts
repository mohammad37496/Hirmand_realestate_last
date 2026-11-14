/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker exposes ONE shared
 * "preview" client. Better Auth 1.7 changes its callback path to
 * `https://*.grok-sandbox.com/api/auth/callback/*`; the broker allowlist in
 * `app-builder-deployer/auth/src/preview-oauth.ts` must be updated to this path
 * before deploying this dependency upgrade. Do not deploy until the broker is
 * updated.
 * This keeps live previews on real sign-in (no demo/mock users) when the preview
 * platform injects the secret server-side. When deployed, the deployer injects per-app
 * `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * The broker's preview client secret is supplied only through the server-side
 * `GROK_PREVIEW_CLIENT_SECRET` environment variable. Never commit it here: this
 * repository is public and a source-level fallback would disclose a reusable
 * OAuth client credential. The broker stores only the secret's
 * `base64url(SHA-256)` hash, so rotate the broker secret and configure the new
 * value in the preview runtime before enabling preview OAuth.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/callback/...`; the broker must allow this path.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
