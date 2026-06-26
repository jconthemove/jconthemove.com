import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Megaphone, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type CampaignRow = {
  id: string;
  campaign_name: string;
  title: string;
  area: string | null;
  focus: string | null;
  audience: string | null;
  image_url: string | null;
  cta_url: string | null;
  promo_code: string | null;
  rep_slug: string | null;
  created_at: string;
  deliveries: number;
  sent: number;
  failed: number;
};

type CampaignsResponse = {
  campaigns: CampaignRow[];
};

const defaults = {
  campaignName: "Area Focus Reminder",
  title: "Moving help available this week",
  message: "JC ON THE MOVE has crew openings for moving help, delivery, junk removal, and local labor. Send the details and we will build the right quote.",
  area: "Ironwood / Northwoods",
  focus: "Moving help + delivery",
  audience: "Marketing team / local crew",
  imageUrl: "https://www.jconthemove.com/og-image.png",
  ctaUrl: "https://www.jconthemove.com/book",
  ctaLabel: "Book / Quote",
  promoCode: "JCMOVE",
  repSlug: "",
};

function fieldLines(form: typeof defaults) {
  return [
    form.area ? ["Area", form.area] : null,
    form.focus ? ["Focus", form.focus] : null,
    form.audience ? ["Audience", form.audience] : null,
    form.promoCode ? ["Promo", form.promoCode] : null,
  ].filter(Boolean) as string[][];
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function AdminMarketingWebhooksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(defaults);
  const [lastResult, setLastResult] = useState<{ campaignId: string; delivered: number; failed: number } | null>(null);

  const campaignsQuery = useQuery<CampaignsResponse>({
    queryKey: ["/api/admin/marketing/webhook-reminders"],
  });

  const campaigns = campaignsQuery.data?.campaigns || [];

  const canSend = form.title.trim().length > 0 && form.message.trim().length > 0;

  const previewFields = useMemo(() => fieldLines(form), [form]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/marketing/webhook-reminders/send", {
        ...form,
        imageUrl: form.imageUrl.trim() || undefined,
        ctaUrl: form.ctaUrl.trim() || undefined,
        ctaLabel: form.ctaLabel.trim() || undefined,
        promoCode: form.promoCode.trim() || undefined,
        repSlug: form.repSlug.trim() || undefined,
        area: form.area.trim() || undefined,
        focus: form.focus.trim() || undefined,
        audience: form.audience.trim() || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult({
        campaignId: data.campaignId,
        delivered: data.delivered,
        failed: data.failed,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketing/webhook-reminders"] });
      toast({
        title: "Marketing reminder sent",
        description: `${data.delivered} delivered${data.failed ? `, ${data.failed} failed` : ""}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send reminder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const update = (key: keyof typeof defaults, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-7xl mx-auto">
      <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-200 text-xs font-semibold uppercase tracking-widest">
            <Megaphone className="h-3.5 w-3.5" />
            Marketing Webhooks
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mt-3">Custom Area Ads</h1>
          <p className="text-slate-400 text-sm mt-1">
            Build one post with area, focus, photo, promo, and CTA, then send it to the configured webhook channels.
          </p>
        </div>
        {lastResult && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Sent {lastResult.delivered}; failed {lastResult.failed}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="campaignName">Campaign</Label>
              <Input id="campaignName" value={form.campaignName} onChange={(e) => update("campaignName", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Headline</Label>
              <Input id="title" value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="message">Post Text</Label>
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                className="min-h-[130px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="area">Area</Label>
              <Input id="area" value={form.area} onChange={(e) => update("area", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="focus">Focus</Label>
              <Input id="focus" value={form.focus} onChange={(e) => update("focus", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audience">Audience</Label>
              <Input id="audience" value={form.audience} onChange={(e) => update("audience", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promoCode">Promo Code</Label>
              <Input id="promoCode" value={form.promoCode} onChange={(e) => update("promoCode", e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="imageUrl">Photo URL</Label>
              <Input id="imageUrl" value={form.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctaUrl">CTA Link</Label>
              <Input id="ctaUrl" value={form.ctaUrl} onChange={(e) => update("ctaUrl", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctaLabel">CTA Label</Label>
              <Input id="ctaLabel" value={form.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="repSlug">Rep Slug</Label>
              <Input id="repSlug" value={form.repSlug} onChange={(e) => update("repSlug", e.target.value)} placeholder="optional marketing rep slug" />
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm(defaults)}
              className="border-slate-700 bg-slate-950/40"
            >
              Reset
            </Button>
            <Button
              type="button"
              disabled={!canSend || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? "Sending..." : "Send Webhook Ad"}
            </Button>
          </div>
        </section>

        <aside className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5 h-fit">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-3">
            <Sparkles className="h-4 w-4 text-orange-300" />
            Discord Preview
          </div>
          <div className="rounded-lg border border-slate-700 bg-[#313338] p-4 text-[#f2f3f5]">
            <div className="text-sm font-bold mb-1">{form.title || "Headline"}</div>
            <div className="text-sm text-[#dbdee1] whitespace-pre-wrap leading-relaxed">{form.message || "Post text"}</div>
            {form.ctaUrl && (
              <a href={form.ctaUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#00a8fc] text-sm">
                {form.ctaUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {previewFields.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                {previewFields.map(([name, value]) => (
                  <div key={name} className="min-w-0">
                    <div className="text-xs font-bold text-[#f2f3f5]">{name}</div>
                    <div className="text-xs text-[#b5bac1] break-words">{value}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-md overflow-hidden border border-slate-700 bg-slate-900/50 min-h-[160px] flex items-center justify-center">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="" className="w-full max-h-72 object-cover" />
              ) : (
                <div className="flex flex-col items-center text-slate-500 text-sm">
                  <ImageIcon className="h-6 w-6 mb-2" />
                  No photo
                </div>
              )}
            </div>
            {form.ctaUrl && (
              <a
                href={form.ctaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center justify-center w-full h-9 rounded-md bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold"
              >
                {form.ctaLabel || "Open Link"}
              </a>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-white">Recent Sends</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-950/40"
            onClick={() => campaignsQuery.refetch()}
          >
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Promo</th>
                <th className="py-2 pr-3">Delivery</th>
                <th className="py-2 pr-3">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No marketing webhook campaigns yet.
                  </td>
                </tr>
              ) : campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-slate-800/70 last:border-0">
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-slate-100">{campaign.title}</div>
                    <div className="text-xs text-slate-500">{campaign.campaign_name}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">
                    <div>{campaign.area || "Any area"}</div>
                    <div className="text-xs text-slate-500">{campaign.focus || "Any focus"}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">{campaign.promo_code || "-"}</td>
                  <td className="py-3 pr-3">
                    <span className="text-emerald-300">{campaign.sent} sent</span>
                    {campaign.failed > 0 && <span className="text-red-300 ml-2">{campaign.failed} failed</span>}
                    <div className="text-xs text-slate-500">{campaign.deliveries} total</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-400 whitespace-nowrap">{formatDate(campaign.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
