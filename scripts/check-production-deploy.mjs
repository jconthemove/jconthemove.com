const healthUrl = process.argv[2] || process.env.PUBLIC_HEALTH_URL || "https://www.jconthemove.com/api/health";
const expectedCommit = (process.env.EXPECTED_COMMIT || process.env.RENDER_GIT_COMMIT || "").slice(0, 8) || null;

function header(res, name) {
  return res.headers.get(name) || "";
}

function hostSignals(res) {
  return [
    header(res, "x-railway-67") ? "railway" : "",
    header(res, "x-railway-edge") ? "railway" : "",
    header(res, "x-render-origin-server") ? "render" : "",
    header(res, "cf-ray") ? "cloudflare" : "",
  ].filter(Boolean);
}

try {
  const res = await fetch(healthUrl, {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
  const signals = hostSignals(res);
  const raw = await res.text();

  let body = null;
  let parseFailed = false;
  try {
    body = JSON.parse(raw);
  } catch {
    parseFailed = true;
    console.error(`[deploy-check] FAIL ${healthUrl}`);
    console.error(`status=${res.status}; hostSignals=${signals.join(",") || "none"}`);
    console.error("response was not JSON");
    process.exitCode = 1;
  }

  if (!parseFailed) {
    const publicCommit = body?.version?.shortCommit || null;
    const problems = [];
    if (signals.includes("railway")) {
      problems.push("public domain is still served by Railway");
    }
    if (!publicCommit) {
      problems.push("public health is missing the version block, so it is an older build");
    }
    if (expectedCommit && publicCommit && publicCommit !== expectedCommit) {
      problems.push(`public commit ${publicCommit} does not match expected ${expectedCommit}`);
    }
    if (!res.ok || body?.status !== "ready") {
      problems.push(`health not ready: http=${res.status} status=${body?.status || "unknown"}`);
    }

    const summary = [
      `url=${healthUrl}`,
      `status=${res.status}`,
      `appStatus=${body?.status || "unknown"}`,
      `commit=${publicCommit || "missing"}`,
      `uptime=${body?.uptimeSeconds ?? "unknown"}`,
      `signals=${signals.join(",") || "none"}`,
    ].join(" ");

    if (problems.length > 0) {
      console.error(`[deploy-check] FAIL ${summary}`);
      for (const problem of problems) console.error(`- ${problem}`);
      process.exitCode = 1;
    } else {
      console.log(`[deploy-check] PASS ${summary}`);
    }
  }
} catch (error) {
  console.error(`[deploy-check] FAIL ${healthUrl}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
