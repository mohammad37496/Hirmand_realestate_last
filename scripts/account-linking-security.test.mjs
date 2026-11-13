import assert from "node:assert/strict";
import { test } from "node:test";
import { handleOAuthUserInfo } from "../node_modules/better-auth/dist/oauth2/link-account.mjs";

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
