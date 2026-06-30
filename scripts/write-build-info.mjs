import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const commit =
  process.env.RENDER_GIT_COMMIT
  || process.env.GITHUB_SHA
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || git(["rev-parse", "HEAD"]);

const branch =
  process.env.RENDER_GIT_BRANCH
  || process.env.GITHUB_REF_NAME
  || process.env.RAILWAY_GIT_BRANCH
  || process.env.VERCEL_GIT_COMMIT_REF
  || git(["rev-parse", "--abbrev-ref", "HEAD"]);

const outDir = resolve(process.cwd(), "dist");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, "build-info.json"),
  JSON.stringify(
    {
      commit,
      shortCommit: commit ? commit.slice(0, 8) : null,
      branch,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

console.log(`[build-info] commit=${commit ? commit.slice(0, 8) : "missing"} branch=${branch || "missing"}`);
