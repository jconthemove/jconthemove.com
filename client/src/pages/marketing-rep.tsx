import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, CalendarCheck, CheckCircle2, Phone, Tag, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import heroImage from "@assets/stock_images/professional_moving__96dea4c1.jpg";

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

  const { data: rep, isLoading } = useQuery<MarketingRep>({
    queryKey: [`/api/marketing-network/reps/${slug}`],
    enabled: !!slug,
  });

  const callHref = rep ? `tel:+${rep.phoneNumber.replace(/\D/g, "")}` : "#";
  const quoteHref = rep ? `/quote?promo=${encodeURIComponent(rep.promoCode)}` : "/quote";

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
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200 mb-5">
                <Tag className="h-3.5 w-3.5" />
                Use code {rep.promoCode} for 10% off
              </div>
              <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-normal">
                {rep.brandName}
              </h1>
              <p className="mt-4 text-xl md:text-2xl text-amber-200 font-bold">{rep.tagline}</p>
              <p className="mt-4 text-zinc-200 text-base md:text-lg max-w-xl leading-relaxed">
                {rep.audience} Every job is booked and completed through JC ON THE MOVE LLC.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <a href={callHref} onClick={trackCall}>
                  <Button size="lg" className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black">
                    <Phone className="mr-2 h-5 w-5" />
                    Call {rep.displayName}
                  </Button>
                </a>
                <Link href={quoteHref}>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/30 bg-white/10 text-white hover:bg-white/20">
                    <CalendarCheck className="mr-2 h-5 w-5" />
                    {rep.ctaLabel}
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
            {rep.displayName} is the face of this service lane, while scheduling, insurance,
            crew coordination, payment, and quality control stay under JC ON THE MOVE LLC.
          </p>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500 uppercase font-bold">This week&apos;s post idea</p>
            <p className="mt-2 text-sm text-zinc-200 leading-relaxed">{weeklyPrompts[0] || rep.contentStrategy?.facebookPersonality}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
