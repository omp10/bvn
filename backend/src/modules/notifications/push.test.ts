import assert from "node:assert/strict";
import { test } from "node:test";
import { isExpoToken } from "./push.js";

/**
 * The token filter is the one thing between a clean fan-out and a request full
 * of garbage: `pushTokens` is an open string array, so anything a client ever
 * POSTed to /auth/push-token ends up in it.
 */
test("accepts the two shapes Expo actually mints", () => {
  assert.ok(isExpoToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"));
  assert.ok(isExpoToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]"));
});

test("rejects anything else", () => {
  for (const bad of [
    "", // an empty string is still a string
    "ExponentPushToken[]", // the bracket alone proves nothing
    "fcm-registration-token-from-a-bare-firebase-sdk",
    "ExponentPushToken",
    null,
    undefined,
    42,
    { to: "ExponentPushToken[abc]" },
  ]) {
    assert.equal(isExpoToken(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});
