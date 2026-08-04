import { test } from "node:test";
import assert from "node:assert";
import { latestByTime, stopProgress, type Stop } from "./trip.progress.js";

// Two stops roughly 1.1 km apart in Pune.
const stops: Stop[] = [
  { _id: "a", name: "Stop A", lat: 18.5074, lng: 73.8077, sequence: 1 },
  { _id: "b", name: "Stop B", lat: 18.5174, lng: 73.8077, sequence: 2 },
];

test("far from the next stop reports nothing", () => {
  const p = stopProgress(stops, 0, { lat: 18.4, lng: 73.8 });
  assert.equal(p.currentStopIndex, 0);
  assert.equal(p.reached, undefined);
  assert.equal(p.approaching, undefined);
});

test("inside the approach radius warns without advancing", () => {
  // ~550 m south of Stop A.
  const p = stopProgress(stops, 0, { lat: 18.5025, lng: 73.8077 });
  assert.equal(p.currentStopIndex, 0);
  assert.equal(p.reached, undefined);
  assert.equal(p.approaching?.stop.name, "Stop A");
  assert.ok(p.approaching!.distanceMeters > 400 && p.approaching!.distanceMeters < 700);
  assert.ok(p.approaching!.etaMinutes >= 1);
});

test("arriving advances to the next stop", () => {
  const p = stopProgress(stops, 0, { lat: 18.5075, lng: 73.8078 });
  assert.equal(p.reached?.name, "Stop A");
  assert.equal(p.currentStopIndex, 1);
});

test("a stop is not reported reached twice", () => {
  const first = stopProgress(stops, 0, { lat: 18.5074, lng: 73.8077 });
  assert.equal(first.reached?.name, "Stop A");
  // Bus still sitting at Stop A, but the index has moved on.
  const second = stopProgress(stops, first.currentStopIndex, { lat: 18.5074, lng: 73.8077 });
  assert.equal(second.reached, undefined);
});

test("past the last stop nothing is reported", () => {
  const p = stopProgress(stops, 2, { lat: 18.5174, lng: 73.8077 });
  assert.equal(p.currentStopIndex, 2);
  assert.equal(p.reached, undefined);
});

test("an out-of-range index is clamped instead of crashing", () => {
  assert.equal(stopProgress(stops, -5, { lat: 0, lng: 0 }).currentStopIndex, 0);
  assert.equal(stopProgress(stops, 99, { lat: 0, lng: 0 }).currentStopIndex, 2);
  assert.equal(stopProgress([], 0, { lat: 0, lng: 0 }).currentStopIndex, 0);
});

test("a wider radius warns from further out", () => {
  const position = { lat: 18.4974, lng: 73.8077 }; // ~1.1 km from Stop A
  assert.equal(stopProgress(stops, 0, position, 800).approaching, undefined);
  assert.ok(stopProgress(stops, 0, position, 1500).approaching);
});

test("latestByTime picks the newest fix from an out-of-order buffer", () => {
  const points = [
    { at: "2026-07-29T08:00:30Z", lat: 3 },
    { at: "2026-07-29T08:00:10Z", lat: 1 },
    { at: "2026-07-29T08:00:20Z", lat: 2 },
  ];
  assert.equal(latestByTime(points)?.lat, 3);
  assert.equal(latestByTime([]), undefined);
});
