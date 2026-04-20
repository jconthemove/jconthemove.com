import type { PipelineContext } from "../context";
import { notifyAdminNewLead } from "../adapters/notify.adapter";

// Notify step — fires an admin SMS for brand-new leads. SMS failure is
// logged only (never fails the pipeline) per task contract.
export async function notifyStep(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.input.persist) {
    ctx.notifications = { sms: false };
    return ctx;
  }
  const primary = ctx.input.items[0]?.serviceCode ?? "unknown";
  const r = await notifyAdminNewLead({
    customerName: ctx.input.customerName || "Customer",
    serviceType: primary,
    phone: ctx.input.customerPhone,
    createdBy: ctx.input.source,
  });
  ctx.notifications = { sms: r.ok };
  return ctx;
}
