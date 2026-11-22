import test from "node:test";
import assert from "node:assert/strict";
import {
  inlineUploadSizeIssue,
  MAX_INLINE_UPLOAD_BYTES,
  MAX_INLINE_ARGUMENT_BYTES,
  INLINE_UPLOAD_GUIDANCE,
} from "../src/lib/mcp/inline-upload-limits";
import { MCP_TOOLS } from "../src/lib/mcp/schemas";

const uri = (bytes: number) =>
  `data:application/octet-stream;base64,${Buffer.alloc(bytes).toString("base64")}`;

test("small base64 inputs retain all resources and metadata", () => {
  for (const resource of ["image", "raw", "video"]) {
    const file = uri(25);
    const args = { file, resource, folder: "small", public_id: "example" };
    assert.equal(inlineUploadSizeIssue(file, args), null);
    assert.equal(args.file, file);
  }
});

test("decoded byte boundary accepts exactly the limit and rejects one byte more", () => {
  const file = uri(MAX_INLINE_UPLOAD_BYTES);
  assert.equal(inlineUploadSizeIssue(file, { file }), null);
  const tooLarge = uri(MAX_INLINE_UPLOAD_BYTES + 1);
  assert.match(inlineUploadSizeIssue(tooLarge, { file: tooLarge })!, /3,000,000/);
});

test("padded, unpadded, whitespace and URL-safe small base64 remain accepted", () => {
  for (const file of ["data:a;base64,YQ==", "data:a;base64,YWI=", "data:a;base64,YWI", " data:a;BASE64,Y Q\n== ", "data:a;base64,-_8="]) {
    assert.equal(inlineUploadSizeIssue(file, { file }), null);
  }
});

test("serialized arguments include UTF-8 metadata and JSON escaping", () => {
  const file = uri(3);
  const args = { file, folder: "" };
  const overhead = Buffer.byteLength(JSON.stringify(args), "utf8");
  args.folder = "a".repeat(MAX_INLINE_ARGUMENT_BYTES - overhead);
  assert.equal(Buffer.byteLength(JSON.stringify(args)), MAX_INLINE_ARGUMENT_BYTES);
  assert.equal(inlineUploadSizeIssue(file, args), null);
  args.folder += "ا";
  assert.ok(inlineUploadSizeIssue(file, args));
  args.folder = '"'.repeat(Math.ceil(MAX_INLINE_ARGUMENT_BYTES / 2));
  assert.ok(inlineUploadSizeIssue(file, args));
});

test("inline SVG data URIs are checked before rendering; raw SVG and URLs are unchanged", () => {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
  const base64Svg = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  for (const file of [svg, base64Svg, `data:image/svg+xml,${encodeURIComponent(svg)}`, "https://example.com/audio.mp3"]) {
    assert.equal(inlineUploadSizeIssue(file, { file }), null);
  }
  const tooLarge = uri(MAX_INLINE_UPLOAD_BYTES + 1).replace("application/octet-stream", "image/svg+xml");
  assert.ok(inlineUploadSizeIssue(tooLarge, { svg: tooLarge }));
});

test("tool schema advertises the same limits without a universal maxLength", () => {
  const tool = MCP_TOOLS.find((entry) => entry.name === "cloudinary_upload_file")!;
  assert.ok(tool.description.includes(INLINE_UPLOAD_GUIDANCE));
  const properties = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
  assert.equal(properties.file.maxLength, undefined);
  assert.ok(String(properties.file.description).includes("413"));
});
