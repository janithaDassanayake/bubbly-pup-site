// Password hashing — bcryptjs (pure JS, no native build → tiny Docker image).
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// The rule itself lives in ./password-policy (no Node imports) so browser forms
// can share it. Re-exported here so server code has one import for everything.
export { MIN_PASSWORD_LENGTH, passwordProblem } from "./password-policy";

// ---- reset tokens ----
// The raw token goes in the emailed link and is shown to nobody else; only its
// hash is stored, so the table is useless to an attacker who reads the database.
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export const newResetToken = () => {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
};

// A temporary password that survives being read aloud or retyped: no 0/O, 1/l/I.
const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function randomPassword(groups = 3, size = 4): string {
  const pick = () =>
    Array.from({ length: size }, () => SAFE[randomInt(SAFE.length)]).join("");
  return Array.from({ length: groups }, pick).join("-");
}
