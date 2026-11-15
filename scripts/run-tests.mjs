import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const testsDir = path.join(root, "tests");
const testFiles = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => path.join(testsDir, f));

if (testFiles.length === 0) {
  console.error("No test files found in tests/");
  process.exit(1);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-admin-tests-"));
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");

try {
  execFileSync(
    process.execPath,
    [
      tscBin,
      "--outDir",
      outDir,
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--target",
      "ES2022",
      "--esModuleInterop",
      "--strict",
      "--skipLibCheck",
      ...testFiles,
    ],
    { stdio: "inherit" },
  );

  const compiledTests = testFiles.map((f) =>
    path.join(outDir, "tests", path.basename(f, ".ts") + ".js"),
  );

  execFileSync(process.execPath, ["--test", ...compiledTests], {
    stdio: "inherit",
  });
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
