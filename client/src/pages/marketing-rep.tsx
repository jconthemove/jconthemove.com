import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, CalendarCheck, CheckCircle2, Copy, Phone, QrCode, Share2, Tag, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import heroImage from "@assets/google_movers/crew-ramp.jpg";

type MarketingRep = {
  id: string;
  slug: string;
  displayName: string;
  brandName: string;
  tagline: string;
  promoCode: string;
  serviceFocus: string[];
  territory: string;
  audience: string;
  ctaLabel: string;
  phoneNumber: string;
  contentStrategy?: {
    facebookPersonality?: string;
    weeklyPrompts?: string[];
  };
};

const coreServiceLinks = [
  {
    label: "Moving",
    service: "moving",
    note: "Apartments, houses, loading, unloading, and local moves",
  },
  {
    label: "Junk Removal",
    service: "junk-removal",
    note: "Cleanouts, furniture, trash piles, and haul-away jobs",
  },
  {
    label: "Delivery",
    service: "delivery",
    note: "Store pickups, furniture delivery, and local hauling",
  },
  {
    label: "Cleanup / Labor",
    service: "cleanup-labor",
    note: "Extra hands for garages, yards, events, and jobsite cleanup",
  },
];

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export default function MarketingRepPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [copied, setCopied] = useState(false);

  const { data: rep, isLoading } = useQuery<MarketingRep>({
    queryKey: [`/api/marketing-network/reps/${slug}`],
    enabled: !!slug,
  });

  const callHref = rep ? `tel:+${rep.phoneNumber.replace(/\D/g, "")}` : "#";
  const quoteHref = rep ? `/book?mode=quick&promo=${encodeURIComponent(rep.promoCode)}&rep=${encodeURIComponent(rep.slug)}` : "/book";
  const builderHref = rep ? `/book?mode=builder&promo=${encodeURIComponent(rep.promoCode)}&rep=${encodeURIComponent(rep.slug)}` : "/book";
  const serviceHref = (service: string) =>
    rep
      ? `/book?mode=quick&service=${encodeURIComponent(service)}&promo=${encodeURIComponent(rep.promoCode)}&rep=${encodeURIComponent(rep.slug)}`
      : `/book?mode=quick&service=${encodeURIComponent(service)}`;
  const shareUrl = rep ? `${window.location.origin}/network/${rep.slug}` : "";
  const qrImageUrl = shareUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(shareUrl)}` : "";
  const shareText = rep ? `${rep.displayName} with JC ON THE MOVE can help book moving, junk removal, delivery, cleanup, and labor work. Use code ${rep.promoCode}: ${shareUrl}` : "";
  const smsShareHref = rep ? `sms:?&body=${encodeURIComponent(shareText)}` : "#";

  async function trackCall() {
    if (!rep) return;
    try {
      await apiRequest("POST", "/api/marketing-network/call", {
        slug: rep.slug,
        sourcePath: window.location.pathname,
      });
    } catch {
      // Do not block the phone call if tracking fails.
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be blocked in some browsers; the visible URL still works.
    }
  }

  async function sharePage() {
    if (!rep || !shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: rep.brandName,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to copying when the native share sheet is unavailable or cancelled.
      }
    }
    await copyShareLink();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!rep) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-black mb-2">Marketing page not found</h1>
          <p className="text-zinc-400 mb-5">This JC ON THE MOVE rep page is not active right now.</p>
          <Link href="/">
            <Button>Back Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const weeklyPrompts = rep.contentStrategy?.weeklyPrompts || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <section className="relative min-h-[88vh] overflow-hidden">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/78 to-zinc-950/30" />
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 min-h-[88vh] flex flex-col">
          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10 w-fit">
              <ArrowLeft className="mr-2 h-4 w-4" />
              JC ON THE MOVE LLC
            </Button>
          </Link>

          <div className="flex-1 grid md:grid-cols-[1fr_380px] gap-8 items-center py-10">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200 mb-5">
                <Tag className="h-3.5 w-3.5" />
                Verified JC ON THE MOVE rep - code {rep.promoCode}
              </div>
              <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-normal">
                {rep.brandName}
              </h1>
              <p className="mt-4 text-xl md:text-2xl text-emerald-200 font-bold">{rep.tagline}</p>
              <p className="mt-4 text-zinc-200 text-base md:text-lg max-w-xl leading-relaxed">
                {rep.audience} Book through this page and the request stays connected to {rep.displayName}, while scheduling, insurance, payment, and quality control stay with JC ON THE MOVE LLC.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <a href={callHref} onClick={trackCall}>
                  <Button size="lg" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black">
                    <Phone className="mr-2 h-5 w-5" />
                    Call {rep.displayName}
                  </Button>
                </a>
                <Link href={quoteHref}>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/30 bg-white/10 text-white hover:bg-white/20">
                    <CalendarCheck className="mr-2 h-5 w-5" />
                    Request Callback
                  </Button>
                </Link>
                <Link href={builderHref}>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/30 bg-white/10 text-white hover:bg-white/20">
                    Build Quote
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-sm text-zinc-400">{formatPhone(rep.phoneNumber)}</p>
            </div>

            <Card className="bg-zinc-900/82 border-white/10 backdrop-blur">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-amber-200 font-black mb-4">
                  <Truck className="h-5 w-5" />
                  Service Focus
                </div>
                <div className="space-y-3">
                  {rep.serviceFocus.map((item) => (
                    <div key={item} className="flex items-center gap-3 text-zinc-100">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 pt-5 border-t border-white/10">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-300 mb-2">
                    <Users className="h-4 w-4 text-sky-300" />
                    Territory / audience
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{rep.territory}</p>
                </div>
                <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Shareable link</p>
                  <p className="mt-2 break-all font-mono text-xs text-zinc-200">{shareUrl}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400" onClick={sharePage}>
                      <Share2 className="mr-2 h-3.5 w-3.5" /> Share
                    </Button>
                    <a href={smsShareHref}>
                      <Button type="button" size="sm" variant="outline" className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                        Text Link
                      </Button>
                    </a>
                    <Button type="button" size="sm" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={copyShareLink}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                    </Button>
                    <Link href={quoteHref}>
                      <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500">
                        <QrCode className="mr-2 h-3.5 w-3.5" /> Book
                      </Button>
                    </Link>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Referral Card</p>
                      <p className="mt-2 text-lg font-black text-white">{rep.displayName}</p>
                      <p className="text-xs text-zinc-300">JC ON THE MOVE verified rep</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white p-2 text-center text-zinc-950">
                      {qrImageUrl ? (
                        <img src={qrImageUrl} alt={`QR code for ${rep.displayName}`} className="h-16 w-16" />
                      ) : (
                        <QrCode className="mx-auto h-8 w-8" />
                      )}
                      <p className="mt-1 text-[9px] font-black uppercase tracking-wide">Scan</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                    <p className="min-w-0 break-all font-mono text-[11px] text-zinc-200">{shareUrl}</p>
                    <div className="rounded-md bg-zinc-950 px-2.5 py-1.5 text-xs font-black text-amber-200">{rep.promoCode}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-zinc-950 px-4 py-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber-300 font-black">Marketing Network</p>
            <h2 className="mt-2 text-2xl font-black">One company, local faces.</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            {rep.displayName} can share this page anywhere: Facebook, text, QR cards, flyers, and repeat-customer follow-ups.
            Every request uses code {rep.promoCode}, so leads, booked jobs, revenue, and commission can be measured in admin.
          </p>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2"><Share2 className="h-3.5 w-3.5" /> This week&apos;s post idea</p>
            <p className="mt-2 text-sm text-zinc-200 leading-relaxed">{weeklyPrompts[0] || rep.contentStrategy?.facebookPersonality}</p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-white text-zinc-950 px-4 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 font-black">Book By Service</p>
              <h2 className="mt-2 text-2xl font-black">Send customers to the right request fast.</h2>
            </div>
            <Link href={quoteHref}>
              <Button className="w-full sm:w-auto bg-zinc-950 text-white hover:bg-zinc-800">
                Request General Callback
              </Button>
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {coreServiceLinks.map((service) => (
              <Link key={service.service} href={serviceHref(service.service)}>
                <Card className="h-full border-zinc-200 bg-zinc-50 transition hover:border-emerald-500 hover:bg-emerald-50">
                  <CardContent className="p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                      <Truck className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-base font-black text-zinc-950">{service.label}</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">{service.note}</p>
                    <p className="mt-4 text-xs font-black uppercase tracking-wider text-emerald-700">
                      Use {rep.promoCode}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            These links keep {rep.displayName}&apos;s code attached all the way into the booking request, so admin can track leads, booked jobs, revenue, and future referral payouts.
          </div>
        </div>
      </section>
    </div>
  );
}
