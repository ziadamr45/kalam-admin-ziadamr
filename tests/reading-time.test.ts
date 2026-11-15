import test from "node:test";
import assert from "node:assert/strict";
import { readingSeconds } from "../src/lib/readingTime";

test("readingSeconds returns default for empty text and 30s floor for short text", () => {
  assert.equal(readingSeconds(""), 60);
  assert.equal(readingSeconds("كلمة"), 30);
});

test("readingSeconds adds quote and heading pauses", () => {
  const body = Array(190).fill("كلمة").join(" ");
  const withExtras = `## عنوان\n\n> اقتباس\n\n${body}`;
  assert.ok(readingSeconds(withExtras) >= 67);
});
