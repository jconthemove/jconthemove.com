#!/usr/bin/env node
// Cross-platform runner for server-side assertion-style tests.
//
// Discovers every `server/**/__tests__/*.test.ts` file, runs them with the
// repo-local tsx binary, and exits non-zero if any file fails.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const serverRoot = path.join(repoRoot, "server");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function findTests(dir) {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTests(fullPath));
      continue;
    }

    const normalized = fullPath.split(path.sep).join("/");
    if (normalized.includes("/__tests__/") && normalized.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = findTests(serverRoot).sort((a, b) => a.localeCompare(b));

if (testFiles.length === 0) {
  console.log("No server tests found under server/**/__tests__/*.test.ts");
  process.exit(0);
}

if (!existsSync(tsxCli)) {
  console.error(`Could not find tsx CLI at ${path.relative(repoRoot, tsxCli)}`);
  console.error("Run npm install before running server tests.");
  process.exit(1);
}

console.log(`Running ${testFiles.length} server test file(s)...\n`);

let failed = 0;
for (const file of testFiles) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  console.log(`--- ${relative} ---`);
  const result = spawnSync(process.execPath, [tsxCli, relative], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${relative}`);
  }
  console.log("");
}

if (failed > 0) {
  console.error(`${failed} test file(s) failed.`);
  process.exit(1);
}

console.log("All server test files passed.");
