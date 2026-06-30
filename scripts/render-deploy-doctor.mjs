import "dotenv/config";
import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const shouldTrigger = args.has("--trigger");

const repo = process.env.GITHUB_REPOSITORY || "JCONTHEMOVE/JCONTHEMOVE.COM";
const workflowName = process.env.RENDER_WORKFLOW_NAME || "Trigger Render Deploy";
const healthUrl = process.env.PUBLIC_HEALTH_URL || "https://jc-on-the-move.onrender.com/health";
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

    if (latest.conclusion !== "success") {
      problems.push(`latest deploy workflow concluded ${latest.conclusion || latest.status}`);
    }

    if (latest.jobs_url) {
      const { response: jobsResponse, body: jobsBody } = await fetchJson(latest.jobs_url);
      if (jobsResponse.ok) {
        const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
        const failedStep = jobs
          .flatMap((job) => Array.isArray(job.steps) ? job.steps : [])
          .find((step) => step.conclusion === "failure");
        if (failedStep) {
          line(`- failed step: ${failedStep.name}`);
          if (failedStep.name === "Stop if Render trigger is missing") {
            problems.push("GitHub has no RENDER_DEPLOY_HOOK_URL or RENDER_API_KEY + RENDER_SERVICE_ID configured");
          }
        }
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
  line();

  if (!hasHook && !hasApi) {
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
line("Fix:");
line("1. In Render, open jc-on-the-move -> Settings/Deploy Hooks and create a deploy hook for main.");
line("2. In GitHub, open JCONTHEMOVE.COM -> Settings -> Secrets and variables -> Actions.");
line("3. Add repository secret RENDER_DEPLOY_HOOK_URL with the full Render deploy hook URL.");
line("4. Optional local shortcut: add the same RENDER_DEPLOY_HOOK_URL to .env and run npm run render:trigger.");
line("5. Re-run the failed GitHub workflow or push a new commit.");
line("6. Confirm npm run verify:production passes and /health shows version.shortCommit.");

process.exit(1);
