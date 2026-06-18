import assert from "node:assert/strict";
import {
  validatePaymentEnv,
  validateRequiredEnv,
  validateStartupEnv,
} from "../envValidation";

const managedEnv = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_ENVIRONMENT",
] as const;

const originalEnv = Object.fromEntries(managedEnv.map((name) => [name, process.env[name]]));

function restoreEnv() {
  for (const name of managedEnv) {
    const original = originalEnv[name];
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  }
}

function clearSquareEnv() {
  delete process.env.SQUARE_ACCESS_TOKEN;
  delete process.env.SQUARE_ENVIRONMENT;
}

try {
  process.env.DATABASE_URL = "postgres://launch:test@localhost:5432/jconthemove";
  process.env.SESSION_SECRET = "test-session-secret";
  clearSquareEnv();

  const startupReady = validateStartupEnv();
  const paymentReady = validatePaymentEnv();
  const fullyReady = validateRequiredEnv();

  assert.equal(startupReady.ok, true, "startup env should allow booting without payment credentials");
  assert.equal(paymentReady.ok, false, "payment env should still fail when Square credentials are missing");
  assert.equal(fullyReady.ok, false, "full launch readiness should still require payment credentials");
  assert.deepEqual(paymentReady.missingRequired.sort(), ["SQUARE_ACCESS_TOKEN", "SQUARE_ENVIRONMENT"]);

  delete process.env.DATABASE_URL;
  const missingCore = validateStartupEnv();
  assert.equal(missingCore.ok, false, "startup env should block when core DATABASE_URL is missing");
  assert.deepEqual(missingCore.missingRequired, ["DATABASE_URL"]);

  console.log("envValidation()");
  console.log("OK startup requires core env but leaves Square to launch readiness");
} finally {
  restoreEnv();
}
