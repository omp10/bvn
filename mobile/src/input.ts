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

  // An international dialling prefix, before anything is measured.
  if (digits.startsWith("00")) digits = digits.slice(2);

  /* Each guarded on an *exact* length, not merely "longer than ten".
     A real Indian mobile can itself begin "91" — 9111100002 is one — so
     "longer than ten" meant that typing an eleventh digit onto a valid number
     made it look like a country code and ate two digits off the front. A
     country code is only a country code when what follows it is exactly a
     ten-digit number; the same goes for a trunk zero. */
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  /* The first ten, not the last ten.
     Keeping the last ten was meant to rescue a pasted number with junk in
     front, but it made typing an eleventh digit silently shift the whole number
     left and drop the first one — the field looked like it had swallowed a
     character at the start, which is exactly what it had done. The two prefix
     rules above already handle every realistic paste ("+91 91111 00004",
     "091111 00004"), so an eleventh digit is a typo and gets ignored instead. */
  return digits.slice(0, 10);
}

/** Uppercase alphanumerics only, max six — the shape codes are issued in. */
export const normaliseCode = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const normaliseOtp = (raw: string): string => raw.replace(/\D/g, "").slice(0, 6);
