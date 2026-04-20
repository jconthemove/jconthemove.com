// Notify adapter — wraps smsService.notifyNewLead. SMS failure must never
// fail the pipeline — it logs only (per task contract).
import { smsService } from "../../services/sms";

export async function notifyAdminNewLead(args: {
  customerName: string;
  serviceType: string;
  phone?: string;
  createdBy?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await smsService.notifyNewLead(args);
    return { ok: !!r.success, error: r.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
