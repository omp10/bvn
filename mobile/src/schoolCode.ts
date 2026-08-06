/**
 * Reads a school code out of whatever a QR scanner hands back.
 *
 * A school's printed QR encodes the invite URL, but the same code reaches a
 * parent in three other shapes: the JSON payload the admin panel can render,
 * a plain code texted by the office, and a link someone pasted. Refusing three
 * of the four because only one is "the" format is how a parent ends up typing
 * it by hand anyway.
 *
 * The invite token is deliberately ignored. It proves the QR is current, not
 * that the person holding it is a parent — the OTP does that, and the server
 * still checks the number is registered at that school before issuing a session.
 */
const CODE = /^[A-Z0-9]{6}$/;

export function schoolCodeFrom(raw: string): string | null {
  const value = raw?.trim();
  if (!value) return null;

  // Bare code, as texted or read off a circular.
  const bare = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (CODE.test(bare) && !value.includes("/") && !value.includes("{")) return bare;

  // The JSON payload: {"code":"ABC123","token":"…"}
  if (value.startsWith("{")) {
    try {
      const code = String(JSON.parse(value)?.code ?? "").toUpperCase();
      return CODE.test(code) ? code : null;
    } catch {
      return null;
    }
  }

  // The invite URL: https://balvahini.com/join/ABC123?t=…
  const joined = /\/join\/([A-Za-z0-9]{6})(?:[/?#]|$)/.exec(value);
  if (joined) {
    const code = joined[1].toUpperCase();
    return CODE.test(code) ? code : null;
  }

  return null;
}
