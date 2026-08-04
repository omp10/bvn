import { test } from "node:test";
import assert from "node:assert";
import { toCsv } from "./csv.js";

const strip = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

test("writes a header row and one line per record", () => {
  const rows = [{ name: "Aarav", cls: "5" }, { name: "Riya", cls: "3" }];
  const lines = strip(toCsv(rows, [["Name", (r) => r.name], ["Class", (r) => r.cls]]));
  assert.deepEqual(lines, ["Name,Class", "Aarav,5", "Riya,3"]);
});

test("quotes commas, quotes and newlines instead of breaking the row", () => {
  const lines = strip(toCsv([{ v: 'Patil, Ramesh "Bus 4"\nnext' }], [["V", (r) => r.v]]));
  assert.equal(lines[1], '"Patil, Ramesh ""Bus 4""\nnext"');
  assert.equal(lines.length, 2); // the embedded newline stays inside the field
});

test("null and undefined become empty cells, not the strings", () => {
  const lines = strip(toCsv([{ a: null, b: undefined }], [["A", (r) => r.a], ["B", (r) => r.b]]));
  assert.equal(lines[1], ",");
});

test("dates are written in a sortable format", () => {
  const lines = strip(toCsv([{ d: new Date("2026-07-29T06:30:00Z") }], [["D", (r) => r.d]]));
  assert.equal(lines[1], "2026-07-29T06:30:00.000Z");
});

test("no rows still produces the header", () => {
  assert.deepEqual(strip(toCsv([] as { a: string }[], [["A", (r) => r.a]])), ["A"]);
});
