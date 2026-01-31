import test from "node:test";
import assert from "node:assert/strict";
import { threeWayMerge } from "../src/lib/merge.js";

test("threeWayMerge clean merge without overlap", () => {
  const base = "a\nb\nc\n";
  const ours = "a\nb\nc\nx\n";
  const theirs = "a\nb\nc\ny\n";
  const result = threeWayMerge(base, theirs, ours);
  assert.equal(result.clean, true);
  assert.equal(result.mergedText, "a\nb\nc\ny\nx\n");
});

test("threeWayMerge conflict on overlapping edits", () => {
  const base = "a\nb\nc\n";
  const ours = "a\nb-ours\nc\n";
  const theirs = "a\nb-theirs\nc\n";
  const result = threeWayMerge(base, theirs, ours);
  assert.equal(result.clean, false);
  assert.ok(result.conflict?.markers.includes("<<<<<<< ours"));
  assert.ok(result.conflict?.hunks?.length);
});

test("threeWayMerge identical edits resolves clean", () => {
  const base = "a\nb\nc\n";
  const ours = "a\nb\nc\nx\n";
  const theirs = "a\nb\nc\nx\n";
  const result = threeWayMerge(base, theirs, ours);
  assert.equal(result.clean, true);
  assert.equal(result.mergedText, "a\nb\nc\nx\n");
});
