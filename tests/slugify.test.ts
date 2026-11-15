import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/lib/slugify";

test("slugify normalizes Arabic and Latin titles", () => {
  assert.equal(slugify("  كلام له لازمة!  "), "كلام-له-لازمة");
  assert.equal(slugify("Hello_World 2026"), "hello-world-2026");
});
