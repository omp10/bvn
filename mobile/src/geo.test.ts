import assert from "node:assert/strict";
import { test } from "node:test";
import { metresBetween, smoothTrail, trailDistance } from "./geo.ts";

/**
 * The trail is what a parent and a school look at to judge whether the bus is
 * moving. Jitter drawn as movement is a lie in the direction that matters.
 */
const at = (lat: number, lng: number) => ({ lat, lng });

test("haversine measures a known short hop", () => {
  // ~1.1 km due north in Pune.
  const d = metresBetween(at(18.5074, 73.8077), at(18.5174, 73.8077));
  assert.ok(d > 1090 && d < 1130, `expected ~1110 m, got ${Math.round(d)}`);
});

test("a parked bus draws no line", () => {
  /* Real jitter wobbles around a point, it does not march away from it. Ten
     fixes alternating a couple of metres either side of one spot is what a bus
     waiting at a stop actually emits. */
  const parked = Array.from({ length: 10 }, (_, i) => at(18.5074 + (i % 2) * 0.00002, 73.8077));
  assert.equal(smoothTrail(parked).length, 1);
});

test("slow but real movement still registers", () => {
  /* Distance is measured from the last *kept* point, not the last raw one, so a
     bus crawling in traffic accumulates until it crosses the threshold. The
     alternative — comparing consecutive raw fixes — would discard slow movement
     forever and freeze the bus on the map in exactly the jam a parent is
     worried about. */
  const crawling = Array.from({ length: 10 }, (_, i) => at(18.5074 + i * 0.00002, 73.8077));
  assert.ok(smoothTrail(crawling).length > 1);
});

test("real movement is kept", () => {
  const moving = [at(18.5074, 73.8077), at(18.5124, 73.8077), at(18.5174, 73.8077)];
  assert.equal(smoothTrail(moving).length, 3);
});

test("a wild fix does not put a line across the city", () => {
  const withGlitch = [
    at(18.5074, 73.8077),
    at(19.076, 72.8777), // Mumbai — a bad lock, not a journey
    at(18.5124, 73.8077),
  ];
  const kept = smoothTrail(withGlitch);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[1], at(18.5124, 73.8077));
});

test("distance is summed along the trail, not end to end", () => {
  const there = [at(18.5074, 73.8077), at(18.5174, 73.8077), at(18.5074, 73.8077)];
  // Out and back is ~2.2 km travelled even though start and end are identical.
  assert.ok(trailDistance(there) > 2100, `got ${Math.round(trailDistance(there))}`);
  assert.equal(trailDistance([at(18.5074, 73.8077)]), 0);
  assert.equal(trailDistance([]), 0);
});
