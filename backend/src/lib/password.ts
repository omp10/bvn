import bcrypt from "bcryptjs";

const ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);

/**
 * Constant work whether or not a hash exists, so an attacker cannot tell a
 * registered phone number from an unregistered one by response time.
 */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", ROUNDS);

export async function verifyPassword(plain: string, hash?: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}
