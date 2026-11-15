import test from "node:test";
import assert from "node:assert/strict";
import { countNunationIssues, fixNunation } from "../src/lib/nunation";

test("fixNunation moves tanween fatha before alef", () => {
  assert.equal(
    fixNunation("عالماً وشكراً ومرحباً"),
    "عالمًا وشكرًا ومرحبًا",
  );
});

test("countNunationIssues counts wrong nunation occurrences", () => {
  assert.equal(countNunationIssues("عالماً وشكراً"), 2);
  assert.equal(countNunationIssues("عالمًا وشكرًا"), 0);
  assert.equal(countNunationIssues(""), 0);
});
