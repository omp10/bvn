import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseCode, normaliseOtp, normalisePhone } from "./input.ts";

test("normalisePhone keeps a plain ten-digit number", () => {
  assert.equal(normalisePhone("9111100002"), "9111100002");
});

test("normalisePhone strips the country code and the spaces around it", () => {
  assert.equal(normalisePhone("+91 91111 00004"), "9111100004");
  assert.equal(normalisePhone("0091-9111100004"), "9111100004");
});

test("normalisePhone strips a trunk zero", () => {
  assert.equal(normalisePhone("09111100004"), "9111100004");
});

test("normalisePhone keeps a number that legitimately starts 91", () => {
  // 9111100002 is a real ten-digit mobile. Stripping "91" off it would leave
  // eight digits and a parent who cannot sign in.
  assert.equal(normalisePhone("9111100002"), "9111100002");
});

test("an eleventh digit is ignored, not shifted in", () => {
  // The reported bug: typing past ten dropped the leading digit, so the field
  // appeared to eat the first number the moment you typed one too many.
  assert.equal(normalisePhone("91111000025"), "9111100002");
  assert.equal(normalisePhone("98765432109876"), "9876543210");
});

test("normaliseCode uppercases and drops separators", () => {
  assert.equal(normaliseCode("4uh yye"), "4UHYYE");
  assert.equal(normaliseCode("abc-123-xyz"), "ABC123");
});

test("normaliseOtp keeps six digits at most", () => {
  assert.equal(normaliseOtp("12 34 56"), "123456");
  assert.equal(normaliseOtp("1234567"), "123456");
});
