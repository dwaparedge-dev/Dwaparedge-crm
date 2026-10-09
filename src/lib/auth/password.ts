import "server-only";
import bcrypt from "bcryptjs";
import { getEnv } from "@/lib/env";

// Real hash of a random value, so unknown emails cost the same as known ones.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(crypto.randomUUID(), getEnv().BCRYPT_SALT_ROUNDS));

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, getEnv().BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? (await getDummyHash()));
  return hash !== null && ok;
}
