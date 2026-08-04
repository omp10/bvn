import { randomBytes, randomInt, randomUUID } from "node:crypto";

/** No I, O, 0 or 1 — school codes get read aloud to parents over the phone. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomSchoolCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const randomOtp = (): string => String(randomInt(100000, 1000000));

export const randomToken = (): string => randomBytes(24).toString("base64url");

export const uuid = (): string => randomUUID();

/** Sequential-looking invoice number without a counter collection. */
export const invoiceNumber = (date = new Date()): string =>
  `BV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
