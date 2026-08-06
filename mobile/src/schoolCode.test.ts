import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolCodeFrom } from "./schoolCode.ts";

/**
 * The one piece of parsing between a camera and a tenant boundary. A wrong code
 * here means a parent lands on the OTP step for another school, so every shape
 * that resolves must resolve to exactly the right six characters.
 */
test("reads the invite URL a printed QR actually encodes", () => {
  assert.equal(schoolCodeFrom("https://balvahini.com/join/V3BSS9?t=abc123"), "V3BSS9");
  assert.equal(schoolCodeFrom("https://balvahini.com/join/V3BSS9"), "V3BSS9");
  assert.equal(schoolCodeFrom("http://localhost:5174/join/5wmrpd"), "5WMRPD");
});

test("reads the JSON payload", () => {
  assert.equal(schoolCodeFrom('{"code":"V3BSS9","token":"whatever"}'), "V3BSS9");
});

test("reads a bare code, however it was typed", () => {
  assert.equal(schoolCodeFrom("V3BSS9"), "V3BSS9");
  assert.equal(schoolCodeFrom("  v3bss9 "), "V3BSS9");
  assert.equal(schoolCodeFrom("V3B-SS9"), "V3BSS9");
});

test("refuses anything it cannot be sure about", () => {
  for (const bad of [
    "",
    "   ",
    "V3BSS", // five characters is not a code
    "V3BSS99", // seven is not either
    "https://balvahini.com/login",
    "https://evil.example.com/join/../../ABC123", // not a /join/ path segment
    "{not json",
    '{"token":"abc"}', // payload without a code
  ]) {
    assert.equal(schoolCodeFrom(bad), null, `should refuse ${JSON.stringify(bad)}`);
  }
});
