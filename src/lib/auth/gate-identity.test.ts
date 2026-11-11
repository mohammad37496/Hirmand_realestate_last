import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { SignJWT, exportJWK, type JWK } from "jose";
import {
  gateIdentityEnabled,
  gateIdentityFromHeaders,
  gateIdentityUserInfo,
  gateKeyResolver,
  gateTokenAudience,
  sessionBoundToGateIdentity,
  verifyGateIdentityToken,
  type GateJwks,
} from "./gate-identity.server.ts";
import { prepareGateIdentitySession } from "./gate-session-lifecycle.ts";

const ISSUER = "https://gate.app-builder-testing.com";
const AUDIENCE = "app:proj-123";

type TestKey = { privateKey: KeyObject; jwk: JWK; kid: string };

async function makeKey(kid: string): Promise<TestKey> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = await exportJWK(publicKey);
  return {
    privateKey,
    kid,
    jwk: { ...jwk, alg: "EdDSA", use: "sig", kid },
  };
}

type SignOptions = {
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  issuedAt?: number;
  omitExp?: boolean;
};

async function signToken(
  key: TestKey,
  claims: Record<string, unknown>,
  options: SignOptions = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt(options.issuedAt ?? now);
  if (!options.omitExp) {
    jwt.setExpirationTime(
      (options.issuedAt ?? now) + (options.expiresIn ?? 300),
    );
  }
  return jwt.sign(key.privateKey);
}

function staticJwks(keys: JWK[]): {
  fetchImpl: (url: string) => Promise<GateJwks | null>;
  calls: () => number;
} {
  let count = 0;
  return {
    fetchImpl: async () => {
      count += 1;
      return { keys };
    },
    calls: () => count,
  };
}

let urlCounter = 0;
function uniqueUrl(): string {
  urlCounter += 1;
  return `https://test-${urlCounter}.invalid/__gate/identity-key`;
}

describe("verifyGateIdentityToken", () => {
  it("returns the identity for a valid token", async () => {
    const key = await makeKey("k1");
    const token = await signToken(key, {
      sub: "user-1",
      email: "viewer@example.com",
      name: "Viewer",
      team_id: "team-9",
      jti: "j1",
    });
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.deepEqual(identity, {
      sub: "user-1",
      email: "viewer@example.com",
      name: "Viewer",
      teamId: "team-9",
    });
  });

  it("omits optional claims as nulls", async () => {
    const key = await makeKey("k1");
    const token = await signToken(key, { sub: "user-2", jti: "j2" });
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.deepEqual(identity, {
      sub: "user-2",
      email: null,
      name: null,
      teamId: null,
    });
  });

  it("rejects a wrong audience", async () => {
    const key = await makeKey("k1");
    const token = await signToken(
      key,
      { sub: "user-1" },
      { audience: "app:other-project" },
    );
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.equal(identity, null);
  });

  it("rejects a wrong issuer", async () => {
    const key = await makeKey("k1");
    const token = await signToken(
      key,
      { sub: "user-1" },
      { issuer: "https://evil.example.com" },
    );
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.equal(identity, null);
  });

  it("rejects an expired token", async () => {
    const key = await makeKey("k1");
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await signToken(
      key,
      { sub: "user-1" },
      { issuedAt: past, expiresIn: 300 },
    );
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.equal(identity, null);
  });

  it("rejects a token without exp", async () => {
    const key = await makeKey("k1");
    const token = await signToken(key, { sub: "user-1" }, { omitExp: true });
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([key.jwk]).fetchImpl),
    });
    assert.equal(identity, null);
  });

  it("rejects a token signed by a different key with the same kid", async () => {
    const trusted = await makeKey("k1");
    const attacker = await makeKey("k1");
    const token = await signToken(attacker, { sub: "user-1" });
    const identity = await verifyGateIdentityToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      getKey: gateKeyResolver(uniqueUrl(), staticJwks([trusted.jwk]).fetchImpl),
    });
    assert.equal(identity, null);
  });

  it("refetches the JWKS when the kid rotates", async () => {
    const oldKey = await makeKey("k-old");
    const newKey = await makeKey("k-new");
    const url = uniqueUrl();
    let calls = 0;
    let published: JWK[] = [oldKey.jwk];
    const fetchImpl = async (): Promise<GateJwks> => {
      calls += 1;
      return { keys: published };
    };
    const getKey = gateKeyResolver(url, fetchImpl);

    const first = await verifyGateIdentityToken(
      await signToken(oldKey, { sub: "user-1" }),
      { issuer: ISSUER, audience: AUDIENCE, getKey },
    );
    assert.equal(first?.sub, "user-1");
    assert.equal(calls, 1);

    published = [newKey.jwk];
    const second = await verifyGateIdentityToken(
      await signToken(newKey, { sub: "user-1" }),
      { issuer: ISSUER, audience: AUDIENCE, getKey },
    );
    assert.equal(second?.sub, "user-1");
    assert.equal(calls, 2);
  });
});

describe("gateIdentityFromHeaders", () => {
  it("verifies the header token end to end and fails closed without it", async () => {
    const key = await makeKey("k1");
    const { fetchImpl } = staticJwks([key.jwk]);
    process.env.GROK_PROJECT_ID = "proj-123";
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      const token = await signToken(key, {
        sub: "user-1",
        email: "viewer@example.com",
      });
      const withToken = await gateIdentityFromHeaders(
        new Headers({ "x-grok-identity": token }),
        fetchImpl,
      );
      assert.equal(withToken?.sub, "user-1");

      const withoutToken = await gateIdentityFromHeaders(
        new Headers(),
        fetchImpl,
      );
      assert.equal(withoutToken, null);
    } finally {
      delete process.env.GROK_PROJECT_ID;
      delete process.env.GROK_GATE_ORIGIN;
    }
  });

  it("activates on a deployed-shaped request without GROK_GATE_ORIGIN", async () => {
    const key = await makeKey("k-deployed");
    const fetchedFrom: string[] = [];
    const fetchImpl = async (url: string): Promise<GateJwks> => {
      fetchedFrom.push(url);
      return { keys: [key.jwk] };
    };
    process.env.GROK_PROJECT_ID = "proj-123";
    delete process.env.GROK_GATE_ORIGIN;
    try {
      const token = await signToken(key, {
        sub: "user-1",
        email: "viewer@example.com",
      });
      const identity = await gateIdentityFromHeaders(
        new Headers({
          host: "my-app.app-builder-testing.com",
          "x-grok-identity": token,
        }),
        fetchImpl,
      );
      assert.equal(identity?.sub, "user-1");
      assert.equal(
        fetchedFrom[0],
        "https://gate.app-builder-testing.com/__gate/identity-key",
      );
    } finally {
      delete process.env.GROK_PROJECT_ID;
    }
  });

  it("verifies a preview-audience token with no gate env vars via the loopback default", async () => {
    const key = await makeKey("k-preview");
    const fetchedFrom: string[] = [];
    const fetchImpl = async (url: string): Promise<GateJwks> => {
      fetchedFrom.push(url);
      return { keys: [key.jwk] };
    };
    delete process.env.GROK_PROJECT_ID;
    delete process.env.GROK_GATE_ORIGIN;
    const token = await signToken(
      key,
      { sub: "user-1" },
      { issuer: "http://127.0.0.1:6014", audience: "preview" },
    );
    const identity = await gateIdentityFromHeaders(
      new Headers({
        host: "my-session.grok-sandbox.com",
        "x-grok-identity": token,
      }),
      fetchImpl,
    );
    assert.equal(identity?.sub, "user-1");
    assert.equal(fetchedFrom[0], "http://127.0.0.1:6014/__gate/identity-key");
  });

  it("rejects a wrong-issuer token in the loopback default mode", async () => {
    const key = await makeKey("k-preview-iss");
    const { fetchImpl } = staticJwks([key.jwk]);
    delete process.env.GROK_PROJECT_ID;
    delete process.env.GROK_GATE_ORIGIN;
    const token = await signToken(
      key,
      { sub: "user-1" },
      { issuer: ISSUER, audience: "preview" },
    );
    const identity = await gateIdentityFromHeaders(
      new Headers({ "x-grok-identity": token }),
      fetchImpl,
    );
    assert.equal(identity, null);
  });

  it("verifies a preview-audience token when only GROK_GATE_ORIGIN is set", async () => {
    const key = await makeKey("k1");
    const { fetchImpl } = staticJwks([key.jwk]);
    delete process.env.GROK_PROJECT_ID;
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      const token = await signToken(
        key,
        { sub: "user-1" },
        { audience: "preview" },
      );
      const identity = await gateIdentityFromHeaders(
        new Headers({ "x-grok-identity": token }),
        fetchImpl,
      );
      assert.deepEqual(identity, {
        sub: "user-1",
        email: null,
        name: null,
        teamId: null,
      });
    } finally {
      delete process.env.GROK_GATE_ORIGIN;
    }
  });

  it("rejects a preview-audience token when GROK_PROJECT_ID is set", async () => {
    const key = await makeKey("k1");
    const { fetchImpl } = staticJwks([key.jwk]);
    process.env.GROK_PROJECT_ID = "proj-123";
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      const token = await signToken(
        key,
        { sub: "user-1" },
        { audience: "preview" },
      );
      const identity = await gateIdentityFromHeaders(
        new Headers({ "x-grok-identity": token }),
        fetchImpl,
      );
      assert.equal(identity, null);
    } finally {
      delete process.env.GROK_PROJECT_ID;
      delete process.env.GROK_GATE_ORIGIN;
    }
  });

  it("rejects an app-audience token in preview mode", async () => {
    const key = await makeKey("k1");
    const { fetchImpl } = staticJwks([key.jwk]);
    delete process.env.GROK_PROJECT_ID;
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      const token = await signToken(key, { sub: "user-1" });
      const identity = await gateIdentityFromHeaders(
        new Headers({ "x-grok-identity": token }),
        fetchImpl,
      );
      assert.equal(identity, null);
    } finally {
      delete process.env.GROK_GATE_ORIGIN;
    }
  });
});

describe("gateIdentityEnabled", () => {
  it("is enabled by default with no gate env vars", () => {
    delete process.env.GROK_PROJECT_ID;
    delete process.env.GROK_GATE_ORIGIN;
    assert.equal(gateIdentityEnabled(), true);
  });

  it("is disabled when VITE_AUTH_ENABLED is false", () => {
    process.env.VITE_AUTH_ENABLED = "false";
    try {
      assert.equal(gateIdentityEnabled(), false);
    } finally {
      delete process.env.VITE_AUTH_ENABLED;
    }
  });
});

describe("gateTokenAudience", () => {
  it("pins app:<id> when GROK_PROJECT_ID is set, even alongside GROK_GATE_ORIGIN", () => {
    process.env.GROK_PROJECT_ID = "proj-123";
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      assert.equal(gateTokenAudience(), "app:proj-123");
    } finally {
      delete process.env.GROK_PROJECT_ID;
      delete process.env.GROK_GATE_ORIGIN;
    }
  });

  it("pins preview when GROK_PROJECT_ID is unset", () => {
    delete process.env.GROK_PROJECT_ID;
    process.env.GROK_GATE_ORIGIN = ISSUER;
    try {
      assert.equal(gateTokenAudience(), "preview");
    } finally {
      delete process.env.GROK_GATE_ORIGIN;
    }
  });
});

describe("gateIdentityUserInfo", () => {
  it("falls back to a synthetic email and name for sub-only claims", () => {
    assert.deepEqual(
      gateIdentityUserInfo({
        sub: "User-1",
        email: null,
        name: null,
        teamId: null,
      }),
      {
        id: "User-1",
        email: "user-1@viewer.grok.invalid",
        emailVerified: false,
        name: "Grok user",
      },
    );
  });

  it("keeps real claims, lowercasing the email and marking it verified", () => {
    assert.deepEqual(
      gateIdentityUserInfo({
        sub: "user-1",
        email: "Viewer@Example.com",
        name: "Viewer",
        teamId: "team-9",
      }),
      {
        id: "user-1",
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer",
      },
    );
  });
});

describe("sessionBoundToGateIdentity", () => {
  const provider = "grok-gate";

  it("keeps the session when it is bound to the same gate sub", () => {
    assert.equal(
      sessionBoundToGateIdentity(
        [
          { providerId: "google", accountId: "g-1" },
          { providerId: provider, accountId: "user-1" },
        ],
        "user-1",
        provider,
      ),
      true,
    );
  });

  it("rotates when the session belongs to a different gate sub", () => {
    assert.equal(
      sessionBoundToGateIdentity(
        [{ providerId: provider, accountId: "user-1" }],
        "user-2",
        provider,
      ),
      false,
    );
  });

  it("rotates when the session user has no gate-bound account", () => {
    assert.equal(
      sessionBoundToGateIdentity(
        [{ providerId: "google", accountId: "user-1" }],
        "user-1",
        provider,
      ),
      false,
    );
    assert.equal(sessionBoundToGateIdentity([], "user-1", provider), false);
  });
});

describe("prepareGateIdentitySession", () => {
  const existing = {
    session: { token: "old-session" },
    user: { id: "old-user" },
  };

  it("does not create a transition dependency when no session cookie exists", async () => {
    let sessionReads = 0;
    let replacements = 0;
    const result = await prepareGateIdentitySession({
      hasSessionCookie: false,
      loadSession: async () => {
        sessionReads += 1;
        return existing;
      },
      loadAccounts: async () => [],
      matchesIdentity: () => false,
      revokeSession: async () => undefined,
      createReplacementSession: async () => {
        replacements += 1;
        return "new-session";
      },
    });
    assert.deepEqual(result, { status: "ready", replacement: "new-session" });
    assert.equal(sessionReads, 0);
    assert.equal(replacements, 1);
  });

  it("keeps an existing session already bound to the same gate identity", async () => {
    let revocations = 0;
    let replacements = 0;
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => existing,
      loadAccounts: async () => [
        { providerId: "grok-gate", accountId: "viewer-1" },
      ],
      matchesIdentity: (accounts) =>
        accounts.some((account) => account.accountId === "viewer-1"),
      revokeSession: async () => {
        revocations += 1;
      },
      createReplacementSession: async () => {
        replacements += 1;
        return "unexpected-replacement";
      },
    });
    assert.deepEqual(result, { status: "same-identity" });
    assert.equal(revocations, 0);
    assert.equal(replacements, 0);
  });

  it("revokes a different session before allowing replacement creation", async () => {
    const calls: string[] = [];
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => existing,
      loadAccounts: async () => [
        { providerId: "credential", accountId: "old-user" },
      ],
      matchesIdentity: () => false,
      revokeSession: async (token) => {
        calls.push(`revoke:${token}`);
      },
      createReplacementSession: async () => {
        calls.push("create");
        return "new-session";
      },
    });
    assert.deepEqual(result, { status: "ready", replacement: "new-session" });
    assert.deepEqual(calls, ["revoke:old-session", "create"]);
  });

  it("stops when the existing session cannot be read", async () => {
    let replacementAllowed = false;
    const failure = new Error("session store unavailable");
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => {
        throw failure;
      },
      loadAccounts: async () => [],
      matchesIdentity: () => false,
      revokeSession: async () => undefined,
      createReplacementSession: async () => {
        replacementAllowed = true;
        return "new-session";
      },
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "session-read");
    assert.equal(result.error, failure);
    assert.equal(replacementAllowed, false);
  });

  it("stops when linked accounts cannot be read", async () => {
    const failure = new Error("account store unavailable");
    let replacements = 0;
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => existing,
      loadAccounts: async () => {
        throw failure;
      },
      matchesIdentity: () => false,
      revokeSession: async () => undefined,
      createReplacementSession: async () => {
        replacements += 1;
        return "unexpected-replacement";
      },
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "account-read");
    assert.equal(result.error, failure);
    assert.equal(replacements, 0);
  });

  it("stops when revocation fails instead of allowing a replacement", async () => {
    let replacementAllowed = false;
    const failure = new Error("session revoke failed");
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => existing,
      loadAccounts: async () => [
        { providerId: "credential", accountId: "old-user" },
      ],
      matchesIdentity: () => false,
      revokeSession: async () => {
        throw failure;
      },
      createReplacementSession: async () => {
        replacementAllowed = true;
        return "new-session";
      },
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "session-revoke");
    assert.equal(result.error, failure);
    assert.equal(replacementAllowed, false);
  });

  it("creates a gate session when the stored cookie is expired or missing", async () => {
    const result = await prepareGateIdentitySession({
      hasSessionCookie: true,
      loadSession: async () => null,
      loadAccounts: async () => [],
      matchesIdentity: () => false,
      revokeSession: async () => undefined,
      createReplacementSession: async () => "new-session",
    });
    assert.deepEqual(result, { status: "ready", replacement: "new-session" });
  });

  it("reports replacement creation failures without throwing past the hook", async () => {
    const failure = new Error("gate account creation failed");
    const result = await prepareGateIdentitySession({
      hasSessionCookie: false,
      loadSession: async () => null,
      loadAccounts: async () => [],
      matchesIdentity: () => false,
      revokeSession: async () => undefined,
      createReplacementSession: async () => {
        throw failure;
      },
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "session-create");
    assert.equal(result.error, failure);
  });
});
