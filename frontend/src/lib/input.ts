/**
 * Input tidying for the things people actually type.
 *
 * Parents write their number as "+91 91111 00004", and copy the school code off
 * a printed circular with a stray space in it. Rejecting those is technically
 * correct and practically useless — normalise first, then validate what remains.
 */

/** Digits only, with an Indian country code or leading zero removed. */
export function normalisePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  // Keep the last ten, so a pasted number with junk in front still resolves.
  return digits.slice(-10);
}

/** Uppercase alphanumerics only, max six — the shape codes are issued in. */
export const normaliseCode = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const normaliseOtp = (raw: string): string => raw.replace(/\D/g, "").slice(0, 6);
