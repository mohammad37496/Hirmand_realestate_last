import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { handleOAuthUserInfo } from "../node_modules/better-auth/dist/oauth2/link-account.mjs";

const previewAuthSource = fs.readFileSync(new URL("../src/lib/auth/preview.ts", import.meta.url), "utf8");
const authServerSource = fs.readFileSync(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8");

test("preview OAuth client secret is supplied by server environment, never committed to source", () => {
  assert.doesNotMatch(previewAuthSource, /PREVIEW_CLIENT_SECRET\s*=/,
    "a public source repository must not contain a reusable OAuth client secret");
  assert.match(authServerSource, /allowPreviewOAuth\s*\?\s*env\("GROK_PREVIEW_CLIENT_SECRET"\)/,
    "preview OAuth must fail closed unless its secret is configured in the server environment");
});

test("a trusted OAuth identity cannot take over an unverified local email/password account", async () => {
  let linkAttempts = 0;
  let sessionAttempts = 0;
  const providerId = "grok-google";
  const result = await handleOAuthUserInfo({
    context: {
      internalAdapter: {
        findAccountOwnerByKey: async () => null,
        findUserByEmail: async () => ({
          user: { id: "attacker-owned-account", email: "victim@example.com", emailVerified: false },
          accounts: [],
        }),
        linkAccount: async () => { linkAttempts += 1; },
        createSession: async () => { sessionAttempts += 1; return { id: "unexpected-session" }; },
      },
      options: { account: { accountLinking: { enabled: true, requireLocalEmailVerified: true } } },
      trustedProviders: [providerId],
      logger: { warn() {}, error() {} },
    },
  }, {
    userInfo: { id: "victim-google-identity", email: "victim@example.com", emailVerified: true },
    account: { accountId: "victim-google-identity", providerId },
    callbackURL: "/",
    disableSignUp: false,
    overrideUserInfo: false,
  });

  assert.equal(result.error, "account not linked");
  assert.equal(result.data, null);
  assert.equal(linkAttempts, 0, "OAuth must not be attached to the attacker's password account");
  assert.equal(sessionAttempts, 0, "a rejected implicit link must not create a session");
});
