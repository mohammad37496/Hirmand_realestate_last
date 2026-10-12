import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
const scrypt = (password: string | Buffer, salt: string | Buffer, keylen: number, options: Parameters<typeof nodeScrypt>[3]) =>
  new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
const N = 16384;
const R = 8;
const P = 1;

export async function hashAdminPassword(password: string) {
  const value = password.trim();
  if (value.length < 10) throw new Error("رمز عبور مدیر باید حداقل ۱۰ کاراکتر باشد.");
  const salt = randomBytes(16);
  const derived = (await scrypt(value, salt, 64, { N, r: R, p: P })) as Buffer;
  return ["scrypt", N, R, P, salt.toString("hex"), derived.toString("hex")].join("$");
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const value = password.trim();
  const [algorithm, nRaw, rRaw, pRaw, saltHex, hashHex] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = (await scrypt(value, salt, expected.length, { N: n, r, p })) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
