import test from "node:test";
import assert from "node:assert/strict";
import { rankForScore, rankMeta } from "../src/lib/ranks";

test("rankForScore maps score thresholds accurately", () => {
  assert.equal(rankForScore(0), "قارئ متأمل");
  assert.equal(rankForScore(49), "قارئ متأمل");
  assert.equal(rankForScore(50), "محاور واعد");
  assert.equal(rankForScore(149), "محاور واعد");
  assert.equal(rankForScore(150), "عقل رصين");
  assert.equal(rankForScore(349), "عقل رصين");
  assert.equal(rankForScore(350), "أهل الكلمة");
});

test("rankMeta falls back to base rank for unknown or null values", () => {
  assert.equal(rankMeta("غير معروف").key, "قارئ متأمل");
  assert.equal(rankMeta(null).key, "قارئ متأمل");
  assert.equal(rankMeta("أهل الكلمة").min, 350);
});
