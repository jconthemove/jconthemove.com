import "dotenv/config";
import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const shouldTrigger = args.has("--trigger");

const repo = process.env.GITHUB_REPOSITORY || "JCONTHEMOVE/JCONTHEMOVE.COM";
const workflowName = process.env.RENDER_WORKFLOW_NAME || "Trigger Render Deploy";
const verifyWorkflowName = process.env.RENDER_VERIFY_WORKFLOW_NAME || "Verify Render Deployment";
const healthUrl = process.env.PUBLIC_HEALTH_URL || "https://jc-on-the-move.onrender.com/health";
const readinessUrl = process.env.RENDER_READINESS_URL || new URL("/api/health", healthUrl).toString();
const customDomainHealthUrl = process.env.CUSTOM_DOMAIN_HEALTH_URL || "https://www.jconthemove.com/health";
const expectedCommit = (
  process.env.EXPECTED_COMMIT
  || process.env.RENDER_GIT_COMMIT
  || git(["rev-parse", "HEAD"])
  || ""
).slice(0, 8) || null;

function git(params) {
  try {
    return execFileSync("git", params, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function present(name) {
  return Boolean(process.env[name]?.trim());
}

function line(message = "") {
  console.log(message);
}

function header(response, name) {
  return response.headers.get(name) || "";
}

function hostSignals(response) {
  return [
    header(response, "x-railway-67") ? "railway" : "",
    header(response, "x-railway-edge") ? "railway" : "",
    header(response, "x-render-origin-server") ? "render" : "",
    header(response, "cf-ray") ? "cloudflare" : "",
    header(response, "server") ? `server=${header(response, "server")}` : "",
  ].filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "jc-render-deploy-doctor",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parseError: text.slice(0, 240) };
  }
  return { response, body };
}

async function checkLiveHealth() {
  line("Live Render health");
  try {
    const { response, body } = await fetchJson(healthUrl);
    const commit = body?.version?.shortCommit || body?.version?.commit?.slice?.(0, 8) || null;
    line(`- url: ${healthUrl}`);
    line(`- http: ${response.status}`);
    line(`- app status: ${body?.status || "unknown"}`);
    line(`- public commit: ${commit || "missing"}`);
    line(`- expected commit: ${expectedCommit || "unknown"}`);
    line(`- boot: ${body?.boot?.status || "unknown"}`);

    const problems = [];
    if (!response.ok) problems.push(`health returned HTTP ${response.status}`);
    if (!commit) problems.push("health is missing version.shortCommit, so Render is serving an older build");
    if (expectedCommit && commit && commit !== expectedCommit) {
      problems.push(`public commit ${commit} does not match local/main commit ${expectedCommit}`);
    }
    if (body?.boot?.status === "failed") problems.push(`boot failed: ${body?.boot?.error || "unknown error"}`);
    return problems;
  } catch (error) {
    line(`- error: ${error instanceof Error ? error.message : String(error)}`);
    return ["could not reach live Render health"];
  } finally {
    line();
  }
}

async function checkRenderReadiness() {
  line("Render readiness");
  try {
    const { response, body } = await fetchJson(readinessUrl);
    const missingRequired = Array.isArray(body?.checks?.env?.missingRequired)
      ? body.checks.env.missingRequired
      : [];
    line(`- url: ${readinessUrl}`);
    line(`- http: ${response.status}`);
    line(`- app status: ${body?.status || "unknown"}`);
    line(`- missing required env: ${missingRequired.length ? missingRequired.join(", ") : "none"}`);

    const problems = [];
    if (!response.ok || body?.status !== "ready") {
      problems.push(`Render readiness is not ready: http=${response.status} status=${body?.status || "unknown"}`);
    }
    if (missingRequired.length) {
      problems.push(`Render missing required env vars: ${missingRequired.join(", ")}`);
    }
    return problems;
  } catch (error) {
    line(`- error: ${error instanceof Error ? error.message : String(error)}`);
    return ["could not reach Render readiness health"];
  } finally {
    line();
  }
}

async function checkCustomDomain() {
  if (!customDomainHealthUrl || customDomainHealthUrl.toLowerCase() === "skip") return [];

  line("Custom domain routing");
  try {
    const { response, body } = await fetchJson(customDomainHealthUrl);
    const signals = hostSignals(response);
    line(`- url: ${customDomainHealthUrl}`);
    line(`- http: ${response.status}`);
    line(`- host signals: ${signals.join(", ") || "none"}`);
    line(`- app status: ${body?.status || "unknown"}`);

    const problems = [];
    if (signals.includes("railway")) {
      problems.push(`${new URL(customDomainHealthUrl).hostname} is still served by Railway instead of Render`);
    }
    if (!response.ok) {
      problems.push(`custom domain health returned HTTP ${response.status}`);
    }
    return problems;
  } catch (error) {
    line(`- error: ${error instanceof Error ? error.message : String(error)}`);
    return [`could not reach custom domain health at ${customDomainHealthUrl}`];
  } finally {
    line();
  }
}

async function checkLatestWorkflow() {
  line("GitHub deploy workflow");
  const problems = [];
  const runsUrl = `https://api.github.com/repos/${repo}/actions/runs?per_page=10`;

  try {
    const { response, body } = await fetchJson(runsUrl);
    if (!response.ok) {
      line(`- could not read workflow runs: HTTP ${response.status}`);
      return [`GitHub API could not read workflow runs for ${repo}`];
    }

    const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
    const latest = runs.find((run) => run.name === workflowName) || runs[0];
    if (!latest) {
      line("- no workflow runs found");
      return [`no GitHub Actions runs found for ${repo}`];
    }

    line(`- run: #${latest.run_number} ${latest.display_title || latest.name}`);
    line(`- sha: ${(latest.head_sha || "").slice(0, 8) || "unknown"}`);
    line(`- status: ${latest.status}`);
    line(`- conclusion: ${latest.conclusion || "none"}`);
    line(`- url: ${latest.html_url}`);

    const latestSha = (latest.head_sha || "").slice(0, 8);

    if (latest.conclusion !== "success") {
      problems.push(`latest deploy workflow concluded ${latest.conclusion || latest.status}`);
    }

    if (latest.jobs_url) {
      const { response: jobsResponse, body: jobsBody } = await fetchJson(latest.jobs_url);
      if (jobsResponse.ok) {
        const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
        const steps = jobs.flatMap((job) => Array.isArray(job.steps) ? job.steps : []);
        const failedStep = jobs
          .flatMap((job) => Array.isArray(job.steps) ? job.steps : [])
          .find((step) => step.conclusion === "failure");
        if (failedStep) {
          line(`- failed step: ${failedStep.name}`);
          if (failedStep.name === "Stop if Render trigger is missing" || failedStep.name === "Stop if strict Render trigger is missing") {
            problems.push("GitHub has no RENDER_DEPLOY_HOOK_URL or RENDER_API_KEY + RENDER_SERVICE_ID configured");
          }
        } else if (latest.status === "in_progress") {
          const verifyingStep = steps
            .find((step) => step.name === "Verify public deployment" && step.status === "in_progress");
          if (verifyingStep) {
            problems.push("GitHub is waiting for Render before the build check can pass; this can deadlock Render services configured with checksPass. Re-run after the split verify workflow lands, or add a Render deploy hook.");
          }
        } else if (latest.conclusion === "success") {
          const triggerConfigStep = steps.find((step) => step.name === "Check Render trigger configuration");
          const hookStep = steps.find((step) => step.name === "Trigger Render deploy hook");
          const apiStep = steps.find((step) => step.name === "Trigger Render deploy API");
          const verifyStep = steps.find((step) => step.name === "Verify public deployment after explicit trigger");
          const skippedExplicitTrigger =
            triggerConfigStep?.conclusion === "success"
            && hookStep?.conclusion === "skipped"
            && apiStep?.conclusion === "skipped"
            && verifyStep?.conclusion === "skipped";
          if (skippedExplicitTrigger) {
            line("- explicit trigger: skipped; relying on Render auto-deploy after GitHub checks pass");
          }
        }
      }
    }

    const latestVerify = runs.find((run) => run.name === verifyWorkflowName);
    if (latestVerify) {
      line(`- verify run: #${latestVerify.run_number} ${latestVerify.display_title || latestVerify.name}`);
      line(`- verify sha: ${(latestVerify.head_sha || "").slice(0, 8) || "unknown"}`);
      line(`- verify status: ${latestVerify.status}`);
      line(`- verify conclusion: ${latestVerify.conclusion || "none"}`);
      line(`- verify url: ${latestVerify.html_url}`);

      const verifySha = (latestVerify.head_sha || "").slice(0, 8);
      const verifyMatchesLatestDeploy = latestSha && verifySha === latestSha;

      if (!verifyMatchesLatestDeploy) {
        line("- verify note: latest verify run is stale for this deploy and is not counted as a blocker");
      } else if (latestVerify.status === "in_progress") {
        problems.push("Render verification is still waiting for the live service to report the pushed commit");
      } else if (latest.conclusion === "success" && latestVerify.conclusion && latestVerify.conclusion !== "success") {
        problems.push(`Render verification workflow concluded ${latestVerify.conclusion}`);
      }
    }

    return problems;
  } catch (error) {
    line(`- error: ${error instanceof Error ? error.message : String(error)}`);
    return ["could not inspect GitHub deploy workflow"];
  } finally {
    line();
  }
}

function checkTriggerEnv() {
  line("Local trigger credentials");
  const hasHook = present("RENDER_DEPLOY_HOOK_URL");
  const hasApi = present("RENDER_API_KEY") && present("RENDER_SERVICE_ID");
  line(`- RENDER_DEPLOY_HOOK_URL: ${hasHook ? "present" : "missing"}`);
  line(`- RENDER_API_KEY + RENDER_SERVICE_ID: ${hasApi ? "present" : "missing"}`);
  if (!hasHook && !hasApi && !shouldTrigger) {
    line("- warning: this machine cannot trigger Render directly; add a deploy hook/API credential before relying on forced deploys");
  }
  line();

  if (shouldTrigger && !hasHook && !hasApi) {
    return ["no local Render deploy trigger credentials are available"];
  }
  return [];
}

async function triggerRenderDeploy() {
  if (present("RENDER_DEPLOY_HOOK_URL")) {
    const response = await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Render deploy hook returned HTTP ${response.status}`);
    }
    line("Render deploy hook fired.");
    return;
  }

  if (present("RENDER_API_KEY") && present("RENDER_SERVICE_ID")) {
    const response = await fetch(`https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`Render deploy API returned HTTP ${response.status}`);
    }
    line(`Render deploy API fired for service ${process.env.RENDER_SERVICE_ID}.`);
    return;
  }

  throw new Error("No Render trigger configured. Set RENDER_DEPLOY_HOOK_URL, or RENDER_API_KEY plus RENDER_SERVICE_ID.");
}

line("JC ON THE MOVE Render Deploy Doctor");
line("===================================");
line();

const problems = [
  ...(await checkLiveHealth()),
  ...(await checkRenderReadiness()),
  ...(await checkCustomDomain()),
  ...(await checkLatestWorkflow()),
  ...checkTriggerEnv(),
];

if (shouldTrigger) {
  line("Trigger request");
  try {
    await triggerRenderDeploy();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    line(`- failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  line();
}

if (problems.length === 0) {
  line("Result: Render deploy path looks healthy.");
  process.exit(0);
}

line("Result: Render deploy path is blocked.");
for (const problem of problems) line(`- ${problem}`);
line();
line("Fix, in order:");
line("1. Render -> jc-on-the-move -> Environment: set DATABASE_URL, SESSION_SECRET, SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, APP_URL=https://www.jconthemove.com.");
line("2. Push a new commit or re-run GitHub Actions. The build check must finish before Render checksPass auto-deploy can begin.");
line("3. If Render still does not deploy, create a main-branch deploy hook in Render and add it to GitHub Actions as RENDER_DEPLOY_HOOK_URL.");
line("4. Cloudflare/DNS: point www.jconthemove.com at the Render custom-domain target, not Railway.");
line("5. Confirm npm run render:doctor passes and /health shows version.shortCommit.");

process.exit(1);
