// Task #175 — Payment classification step in the booking pipeline.
//
// Runs after persist, before notify. Uses the pure paymentClassifier to
// decide deposit-required / wallet-pay-now / pay-on-completion / cash-or-btc
// for the just-priced booking. The plan + deposit recommendation are
// attached to the context so notify.step can mention them in the SMS / email
// and the admin payment panel can render the same plan.
//
// Side effects when persist is on AND we have a leadId:
//   • leads.payment_plan / deposit_required / deposit_amount_gate are
//     persisted so the dispatch deposit gate (server/dispatch/isDispatchable)
//     and the consolidated payment status pill agree on the plan.
//   • For deposit_required leads we send a Square deposit invoice via the
//     existing squareInvoiceService.createInvoiceForLead helper and stash
//     the invoice URL on the lead so the customer (and the admin payment
//     panel) can deep-link straight to the pay page.

import type { PipelineContext } from "../context";
import { classifyPayment } from "../../services/paymentClassifier";
import { pool } from "../../db";

export async function paymentStep(ctx: PipelineContext): Promise<PipelineContext> {
  const total = ctx.surgedTotal ?? ctx.quote?.finalTotal ?? 0;
  const codes = (ctx.input.items ?? []).map((i) => i.serviceCode);
  const plan = classifyPayment({
    finalTotal: total,
    serviceCodes: codes,
    payFromWallet: !!ctx.input.payFromWallet,
  });
  ctx.payment = { ...plan };

  const leadId = ctx.persistedLeadId;
  if (!leadId) return ctx;

  // Persist gate columns onto the lead row. Best-effort — a failure
  // here just leaves the lead with no plan recorded; the admin payment
  // panel will still show "—" rather than crash.
  try {
    await pool.query(
      `UPDATE leads
          SET payment_plan = $2,
              deposit_required = $3,
              deposit_amount_gate = COALESCE(deposit_amount_gate, $4)
        WHERE id = $1`,
      [
        leadId,
        plan.kind,
        plan.kind === "deposit_required",
        plan.depositAmount > 0 ? plan.depositAmount.toFixed(2) : null,
      ],
    );
  } catch (e) {
    console.warn("[pipeline.payment] persist gate failed:", e instanceof Error ? e.message : e);
  }

  // Auto-send the Square deposit invoice for deposit_required jobs that
  // don't already have one. Skips silently when the helper or Square
  // env is unavailable so the pipeline keeps moving.
  if (plan.kind === "deposit_required" && plan.depositAmount > 0) {
    try {
      const { rows } = await pool.query<{
        deposit_paid: boolean | null;
        square_payment_url: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        service_type: string | null;
      }>(
        `SELECT deposit_paid, square_payment_url,
                first_name, last_name, email, phone, service_type
           FROM leads WHERE id = $1 LIMIT 1`,
        [leadId],
      );
      const lead = rows[0];
      if (lead && !lead.deposit_paid && !lead.square_payment_url && lead.email) {
        const { squareInvoiceService } = await import("../../services/square-invoice");
        const result = await squareInvoiceService.createInvoiceForLead(
          {
            id: leadId,
            firstName: lead.first_name ?? "Customer",
            lastName: lead.last_name ?? "",
            email: lead.email,
            phone: lead.phone ?? null,
            serviceType: lead.service_type ?? "moving",
          } as Parameters<typeof squareInvoiceService.createInvoiceForLead>[0],
          plan.depositAmount,
          `Deposit for ${lead.service_type ?? "moving"} job`,
          undefined,
          lead.phone ? "both" : "email",
        );
        await pool.query(
          `UPDATE leads SET square_payment_url = $2 WHERE id = $1`,
          [leadId, result.invoiceUrl],
        );
        ctx.payment.depositInvoiceSent = true;
        ctx.payment.depositInvoiceUrl = result.invoiceUrl;
      }
    } catch (e) {
      console.warn("[pipeline.payment] deposit invoice send failed:", e instanceof Error ? e.message : e);
    }
  }

  return ctx;
}
