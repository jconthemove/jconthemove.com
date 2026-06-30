import "dotenv/config";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const renderHealthUrl = process.env.PUBLIC_HEALTH_URL || "https://jc-on-the-move.onrender.com/health";
const renderReadinessUrl = process.env.RENDER_READINESS_URL || "https://jc-on-the-move.onrender.com/api/health";
const customDomainHealthUrl = process.env.CUSTOM_DOMAIN_HEALTH_URL || "https://www.jconthemove.com/health";
const expectedCommit = (process.env.EXPECTED_COMMIT || git(["rev-parse", "HEAD"]) || "").slice(0, 8);

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

function sessionSecret() {
  return randomBytes(48).toString("base64url");
}

function header(response, name) {
  return response.headers.get(name) || "";
}

function hostSignals(response) {
  return [
    header(response, "x-render-origin-server") ? "render" : "",
    header(response, "x-railway-67") ? "railway" : "",
    header(response, "x-railway-edge") ? "railway" : "",
    header(response, "server") ? `server=${header(response, "server")}` : "",
    header(response, "cf-ray") ? "cloudflare" : "",
  ].filter(Boolean);
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "User-Agent": "jc-render-repair-guide",
      },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { parseError: text.slice(0, 180) };
    }
    return { ok: true, response, body };
  } catch (error) {
    return { ok: false, error };
  }
}

function printCheck(name, result) {
  console.log(name);
  if (!result.ok) {
    console.log(`- error: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
    console.log();
    return;
  }

  const { response, body } = result;
  const commit = body?.version?.shortCommit || body?.version?.commit?.slice?.(0, 8) || "missing";
  console.log(`- http: ${response.status}`);
  console.log(`- app status: ${body?.status || "unknown"}`);
  console.log(`- commit: ${commit}`);
  console.log(`- host: ${hostSignals(response).join(", ") || "none"}`);
  if (Array.isArray(body?.checks?.env?.missingRequired)) {
    console.log(`- missing required env: ${body.checks.env.missingRequired.join(", ") || "none"}`);
  }
  console.log();
}

function printRenderSteps(secret) {
  const localKeys = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_ENVIRONMENT",
    "APP_URL",
    "RENDER_DEPLOY_HOOK_URL",
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
  ];

  console.log("Local .env presence check (values hidden)");
  console.log("=========================================");
  for (const key of localKeys) {
    console.log(`- ${key}: ${process.env[key]?.trim() ? "present" : "missing"}`);
  }
  console.log();

  console.log("Paste these into Render -> jc-on-the-move -> Environment");
  console.log("========================================================");
  console.log(`SESSION_SECRET=${secret}`);
  console.log("APP_URL=https://www.jconthemove.com");
  console.log("SQUARE_ENVIRONMENT=sandbox");
  console.log("SQUARE_ACCESS_TOKEN=<paste Square sandbox token for testing, or production token when you switch SQUARE_ENVIRONMENT=production>");
  console.log("DATABASE_URL=<copy the same DATABASE_URL value from local .env if Render does not already have it>");
  console.log();
  console.log("Confirm these Render settings");
  console.log("=============================");
  console.log("- Branch: main");
  console.log("- Build Command: npm ci && npm run build");
  console.log("- Start Command: npm run start");
  console.log("- Health Check Path: /health");
  console.log("- Auto deploy: commit/on-commit");
  console.log("- Custom domain: www.jconthemove.com");
  console.log();
  console.log("Add one deploy trigger so GitHub can force Render to pull the latest commit");
  console.log("==========================================================================");
  console.log("1. Render -> jc-on-the-move -> Deploy Hooks -> add hook for branch main.");
  console.log("2. GitHub -> JCONTHEMOVE.COM -> Settings -> Secrets and variables -> Actions.");
  console.log("3. Add repository secret: RENDER_DEPLOY_HOOK_URL=<full Render deploy hook URL>");
  console.log("4. Re-run the GitHub workflow or push a new commit.");
  console.log();
  console.log("Cloudflare/DNS");
  console.log("==============");
  console.log("- Point www.jconthemove.com to Render's custom-domain target.");
  console.log("- Keep the apex jconthemove.com redirecting to https://www.jconthemove.com preserving the path/query.");
  console.log();
  console.log("Verify");
  console.log("======");
  console.log("npm run render:doctor");
  console.log(`Expected live Render commit: ${expectedCommit || "unknown"}`);
}

console.log("JC ON THE MOVE Render Repair Guide");
console.log("==================================");
console.log();

const [renderHealth, renderReadiness, customDomainHealth] = await Promise.all([
  fetchJson(renderHealthUrl),
  fetchJson(renderReadinessUrl),
  fetchJson(customDomainHealthUrl),
]);

printCheck(`Render liveness: ${renderHealthUrl}`, renderHealth);
printCheck(`Render readiness: ${renderReadinessUrl}`, renderReadiness);
printCheck(`Public domain: ${customDomainHealthUrl}`, customDomainHealth);

printRenderSteps(sessionSecret());
