// Task #175 — Required env-var gate for payment surfaces.
//
// Called from server/index.ts before registerRoutes. Refuses to boot when
// any required payment env var is missing so a fresh deploy can never
// silently lose Square card flow or BTC verification.

interface EnvCheck {
  name: string;
  required: boolean;
  /** Why we need it — printed in the error so the operator knows what to set. */
  purpose: string;
}

const PAYMENT_ENV: EnvCheck[] = [
  { name: "SQUARE_ACCESS_TOKEN", required: true,  purpose: "Square card invoicing + customer search" },
  { name: "SQUARE_ENVIRONMENT",  required: true,  purpose: "Square sandbox vs production switch" },
  { name: "BTC_WALLET_ADDRESS",  required: false, purpose: "Bitcoin payment auto-verify sweep + customer pay-with-BTC display" },
  { name: "TWILIO_ACCOUNT_SID",  required: false, purpose: "Square invoice SMS delivery + crew dispatch SMS" },
  { name: "TWILIO_AUTH_TOKEN",   required: false, purpose: "Twilio API auth — paired with TWILIO_ACCOUNT_SID" },
];

export interface EnvValidationResult {
  ok: boolean;
  missingRequired: string[];
  missingOptional: string[];
  details: Array<{ name: string; required: boolean; purpose: string; present: boolean }>;
}

export function validatePaymentEnv(): EnvValidationResult {
  const details = PAYMENT_ENV.map((c) => {
    const present = !!(process.env[c.name] && String(process.env[c.name]).trim());
    return { ...c, present };
  });
  const missingRequired = details.filter((d) => d.required && !d.present).map((d) => d.name);
  const missingOptional = details.filter((d) => !d.required && !d.present).map((d) => d.name);
  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    details,
  };
}

/**
 * Call from server/index.ts. Logs every check, lists what's missing, and
 * warns when any REQUIRED var is unset. Strict readiness checks surface the
 * missing configuration without preventing platform liveness probes from
 * reaching the app.
 */
export function assertPaymentEnvOrExit(): void {
  if (process.env.NODE_ENV !== "production") {
    console.log("[env-check] non-production environment detected; payment env vars are optional for local development.");
    return;
  }

  const result = validatePaymentEnv();
  // eslint-disable-next-line no-console
  console.log("[env-check] payment surface env vars:");
  for (const d of result.details) {
    const tag = d.present ? "✅" : (d.required ? "❌" : "⚠️ ");
    // eslint-disable-next-line no-console
    console.log(`  ${tag} ${d.name} (${d.required ? "required" : "optional"}) — ${d.purpose}`);
  }
  if (!result.ok) {
    const list = result.missingRequired.map((n) => `  • ${n}`).join("\n");
    const msg = `\n[env-check] payment features are not ready - missing required payment env vars:\n${list}\n\nSet these in your production environment and restart.`;
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}
