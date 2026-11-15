import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInline,
  inlineWords,
  parseBlocks,
  blockPlainWords,
  blockWordCount,
  toArabicDigits,
} from "../src/lib/content-blocks";

test("parseInline handles bold, italic, strikethrough, and code priority", () => {
  const segs = parseInline("**مهم** و *مائل* و ~~مشطوب~~ و `**ليس_غامقًا**`");
  assert.deepEqual(
    segs.filter((s) => s.t !== "text"),
    [
      { t: "b", x: "مهم" },
      { t: "i", x: "مائل" },
      { t: "s", x: "مشطوب" },
      { t: "c", x: "**ليس_غامقًا**" },
    ],
  );
  assert.deepEqual(inlineWords("**كلام** *له* `لازمة`"), ["كلام", "له", "لازمة"]);
});

test("parseBlocks parses headings, lists, quotes, hr, and GFM tables", () => {
  const md = [
    "## عنوان رئيسي",
    "",
    "### عنوان فرعي",
    "",
    "فقرة عادية",
    "",
    "> اقتباس",
    "",
    "- عنصر ١\n- عنصر ٢",
    "",
    "1. أولًا\n2. ثانيًا",
    "",
    "---",
    "",
    "| عمود ١ | عمود ٢ |\n| :--- | :---: |\n| أ | ب |",
  ].join("\n");

  const blocks = parseBlocks(md);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["h2", "h3", "p", "quote", "list", "olist", "hr", "table"],
  );
  const table = blocks[7];
  assert.equal(table.kind, "table");
  if (table.kind === "table") {
    assert.deepEqual(table.aligns, ["start", "center"]);
    assert.deepEqual(table.head, ["عمود ١", "عمود ٢"]);
    assert.deepEqual(table.rows, [["أ", "ب"]]);
  }
});

test("parseBlocks parses legacy quran/hadith and directives, ignoring empty ones", () => {
  const md = [
    "[[آية|البقرة|255]]\nالله لا إله إلا هو\n[[/آية]]",
    "",
    ":::hadith{narrator=\"البخاري\"}\nإنما الأعمال بالنيات\n:::",
    "",
    ":::note\nتأمل\n:::",
    "",
    ":::question\nلماذا؟\n:::",
    "",
    ":::note\n   \n:::",
  ].join("\n");

  const blocks = parseBlocks(md);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].kind, "quran");
  assert.equal(blocks[1].kind, "hadith");
  assert.equal(blocks[2].kind, "note");
  assert.equal(blocks[3].kind, "question");

  for (const b of blocks) {
    assert.equal(blockWordCount(b), blockPlainWords(b).length);
  }
});

test("toArabicDigits converts ASCII digits to Eastern Arabic", () => {
  assert.equal(toArabicDigits("255"), "٢٥٥");
});
