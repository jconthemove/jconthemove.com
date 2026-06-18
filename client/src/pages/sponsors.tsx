import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Handshake, Mail, Phone, Loader2, Check, Star, Globe, Users, CreditCard, Upload, ImageIcon, X, Zap, TrendingUp, Rocket, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Sponsor } from "@shared/schema";

const TIER_ORDER: Record<string, number> = { starter: 0, growth: 1, power: 2 };

const sponsorTiers = [
  {
    id: "sponsor-starter",
    name: "Starter",
    tier: "starter",
    price: 50,
    icon: Zap,
    gradient: "from-emerald-700 to-emerald-900",
    border: "border-emerald-500/60",
    ring: "",
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-300",
    titleColor: "text-emerald-200",
    priceColor: "text-emerald-100",
    perks: [
      "Logo on our website",
      "Monthly social media shoutout",
      "Thank-you post across all platforms",
    ],
  },
  {
    id: "sponsor-growth",
    name: "Growth",
    tier: "growth",
    price: 100,
    icon: TrendingUp,
    gradient: "from-blue-600 to-blue-900",
    border: "border-blue-400/60",
    ring: "ring-1 ring-blue-400/30",
    popular: true,
    iconBg: "bg-blue-400/20",
    iconColor: "text-blue-200",
    titleColor: "text-blue-100",
    priceColor: "text-white",
    perks: [
      "Everything in Starter",
      "Logo decal on our moving trucks",
      "Featured in email newsletters",
      "Priority mention at community events",
    ],
  },
  {
    id: "sponsor-power",
    name: "Power",
    tier: "power",
    price: 200,
    icon: Rocket,
    gradient: "from-yellow-600 to-amber-900",
    border: "border-yellow-400/60",
    ring: "ring-2 ring-yellow-400/40",
    iconBg: "bg-yellow-400/20",
    iconColor: "text-yellow-200",
    titleColor: "text-yellow-100",
    priceColor: "text-yellow-50",
    perks: [
      "Everything in Growth",
      "Featured partner status on site",
      "Co-branded marketing materials",
      "VIP event invitations",
      "Dedicated partner section on site",
    ],
  },
];

export default function SponsorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkoutTier, setCheckoutTier] = useState<typeof sponsorTiers[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
  });

  const { data: activeSponsors = [], isLoading: loadingSponsors } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (file: File) => {
    setLogoFile(file);
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("card", file);
      const res = await fetch("/api/sponsor/upload-card", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoUrl(data.url);
      toast({ title: "Logo uploaded!" });
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
      setLogoFile(null);
      setLogoUrl("");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleGetStarted = (tier: typeof sponsorTiers[0]) => {
    setCheckoutTier(tier);
    setAgreedToTerms(false);
    setLogoFile(null);
    setLogoUrl("");
    setForm({ businessName: "", contactName: "", email: "", phone: "", website: "" });
  };

  const handleDirectCheckout = async () => {
    if (!checkoutTier) return;
    if (!form.businessName || !form.contactName || !form.email || !form.phone) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/sponsor/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tierId: checkoutTier.id,
          tierName: `${checkoutTier.name} Sponsor`,
          tierPrice: checkoutTier.price,
          businessCardUrl: logoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error: any) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group active sponsors by tier
  const sponsorsByTier = activeSponsors.reduce<Record<string, Sponsor[]>>((acc, sponsor) => {
    if (!acc[sponsor.tier]) acc[sponsor.tier] = [];
    acc[sponsor.tier].push(sponsor);
    return acc;
  }, {});

  const tierKeys = Object.keys(sponsorsByTier).sort((a, b) => (TIER_ORDER[b] ?? 0) - (TIER_ORDER[a] ?? 0));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Handshake className="h-10 w-10 text-yellow-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Sponsor JC ON THE MOVE
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Partner with Marquette's trusted moving company and put your brand in front of thousands of customers across Michigan's Upper Peninsula.
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-10">
          {sponsorTiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <Card
                key={tier.id}
                className={`relative overflow-hidden bg-gradient-to-b ${tier.gradient} ${tier.border} ${tier.ring} transition-transform hover:scale-[1.02]`}
              >
                {tier.popular && (
                  <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    POPULAR
                  </div>
                )}
                <CardContent className="p-6">
                  <div className={`${tier.iconBg} p-3 rounded-xl w-fit mb-4`}>
                    <Icon className={`h-8 w-8 ${tier.iconColor}`} />
                  </div>

                  <h3 className={`text-xl font-bold ${tier.titleColor} mb-1`}>{tier.name} Sponsor</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className={`text-3xl font-extrabold ${tier.priceColor}`}>${tier.price}</span>
                    <span className="text-sm text-white/60">/month</span>
                  </div>

                  <ul className="space-y-2 mb-5">
                    {tier.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/90">
                        <Check className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full bg-white/90 hover:bg-white text-slate-900 font-bold"
                    onClick={() => handleGetStarted(tier)}
                  >
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Modal */}
        {checkoutTier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCheckoutTier(null)}
            />
            <Card className="relative z-50 w-full max-w-md bg-slate-800 border-slate-600 shadow-2xl max-h-[90vh] overflow-y-auto">
              <CardContent className="p-6">
                <button
                  onClick={() => setCheckoutTier(null)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="text-center mb-5">
                  <h2 className="text-xl font-bold text-white">{checkoutTier.name} Sponsor</h2>
                  <p className="text-2xl font-extrabold text-yellow-400 mt-1">${checkoutTier.price}/month</p>
                  <p className="text-xs text-slate-400 mt-1">Billed monthly via Square</p>
                </div>

                <div className="bg-slate-700/40 rounded-lg p-3 mb-4">
                  <p className="text-xs text-slate-400 font-medium mb-1.5">What you get:</p>
                  <ul className="space-y-1">
                    {checkoutTier.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-white/80">
                        <Check className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <Label className="text-white text-sm">Business Name *</Label>
                    <Input value={form.businessName} onChange={(e) => updateField("businessName", e.target.value)} placeholder="Your Business LLC" className="bg-slate-700 border-slate-600 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Contact Name *</Label>
                    <Input value={form.contactName} onChange={(e) => updateField("contactName", e.target.value)} placeholder="Best contact name" className="bg-slate-700 border-slate-600 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="you@business.com" className="bg-slate-700 border-slate-600 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Phone *</Label>
                    <Input type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Best phone number" className="bg-slate-700 border-slate-600 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Website (optional)</Label>
                    <Input value={form.website} onChange={(e) => updateField("website", e.target.value)} placeholder="Business website URL" className="bg-slate-700 border-slate-600 text-white mt-1" />
                  </div>

                  {/* Logo Upload */}
                  <div>
                    <Label className="text-white text-sm">Business Logo (optional)</Label>
                    <p className="text-xs text-slate-400 mb-2">Upload your logo - we'll display it on your sponsor card.</p>
                    {!logoFile ? (
                      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-yellow-500/60 hover:bg-slate-700/40 transition-colors">
                        <Upload className="h-5 w-5 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">Click to upload (JPG, PNG, PDF)</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLogoUpload(file);
                          }}
                        />
                      </label>
                    ) : (
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${logoUrl ? "border-green-500/40 bg-green-900/20" : "border-slate-600 bg-slate-700/40"}`}>
                        {uploadingLogo ? (
                          <Loader2 className="h-5 w-5 text-yellow-400 animate-spin shrink-0" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-green-400 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white font-medium truncate">{logoFile.name}</p>
                          <p className="text-xs text-slate-400">{uploadingLogo ? "Uploading…" : "Ready to submit"}</p>
                        </div>
                        <button
                          onClick={() => { setLogoFile(null); setLogoUrl(""); }}
                          className="text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start space-x-3 mb-5">
                  <Checkbox
                    id="sponsor-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-1 border-slate-500"
                  />
                  <label htmlFor="sponsor-terms" className="text-xs text-slate-300 cursor-pointer leading-relaxed">
                    I agree to the <Link href="/terms" className="text-blue-400 underline">Terms of Service</Link>. This is a monthly sponsorship billed via Square. You may cancel at any time.
                  </label>
                </div>

                <Button
                  onClick={handleDirectCheckout}
                  disabled={isSubmitting || !agreedToTerms || uploadingLogo}
                  className="w-full py-5 text-base font-bold bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
                  ) : uploadingLogo ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Uploading logo...</>
                  ) : (
                    <><CreditCard className="h-5 w-5 mr-2" /> Pay ${checkoutTier.price}/month via Square</>
                  )}
                </Button>
                <p className="text-center text-xs text-slate-400 mt-2">Secure payment via Square. You'll be redirected to complete checkout.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Why Sponsor section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <Globe className="h-8 w-8 text-blue-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Website & Social</p>
            <p className="text-slate-400 text-xs mt-1">Your brand reaches our entire online audience</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <Handshake className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Moving Trucks</p>
            <p className="text-slate-400 text-xs mt-1">Your logo on trucks seen across the UP daily</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <Users className="h-8 w-8 text-purple-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Community Events</p>
            <p className="text-slate-400 text-xs mt-1">Be recognized at local events and gatherings</p>
          </div>
        </div>

        {/* Current Sponsors Section */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white text-center mb-6">Current Sponsors</h2>

          {loadingSponsors ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 text-yellow-400 animate-spin" />
            </div>
          ) : activeSponsors.length === 0 ? (
            <Card className="bg-slate-800/40 border-slate-700/50 border-dashed">
              <CardContent className="py-10 text-center">
                <Star className="h-10 w-10 text-yellow-500/40 mx-auto mb-3" />
                <p className="text-slate-300 text-lg font-medium">Be the first to sponsor JC ON THE MOVE!</p>
                <p className="text-slate-500 text-sm mt-1">Your logo and brand featured right here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {tierKeys.map((tierKey) => {
                const tierDef = sponsorTiers.find((t) => t.tier === tierKey);
                const tierSponsors = sponsorsByTier[tierKey];
                return (
                  <div key={tierKey}>
                    <div className="flex items-center gap-2 mb-3">
                      {tierDef && (
                        <Badge className={`bg-gradient-to-r ${tierDef.gradient} text-white border-0 capitalize`}>
                          {tierKey} Sponsors
                        </Badge>
                      )}
                      <div className="flex-1 h-px bg-slate-700/60" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {tierSponsors.map((sponsor) => (
                        <a
                          key={sponsor.id}
                          href={sponsor.website || undefined}
                          target={sponsor.website ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className={`block bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center hover:border-slate-500 transition-colors ${sponsor.featured ? "ring-2 ring-yellow-500/40" : ""} ${sponsor.website ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {sponsor.logoUrl ? (
                            <img
                              src={sponsor.logoUrl}
                              alt={sponsor.businessName}
                              className="h-14 w-full object-contain rounded mb-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="h-14 flex items-center justify-center mb-2">
                              <Handshake className="h-8 w-8 text-slate-500" />
                            </div>
                          )}
                          <p className="text-white text-xs font-semibold truncate">{sponsor.businessName}</p>
                          {sponsor.featured && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] mt-1">Featured</Badge>
                          )}
                          {sponsor.website && (
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <ExternalLink className="h-3 w-3 text-blue-400" />
                              <span className="text-blue-400 text-[10px] truncate max-w-[80px]">{sponsor.website.replace(/^https?:\/\//, "")}</span>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="text-center pb-8">
          <p className="text-slate-300 mb-2">Questions about sponsorship?</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="tel:906-285-9312">
              <Button variant="outline" className="border-slate-500 text-slate-200 hover:bg-white/10">
                <Phone className="h-4 w-4 mr-2" />
                (906) 285-9312
              </Button>
            </a>
            <a href="mailto:upmichiganstatemovers@gmail.com?subject=Sponsorship%20Inquiry">
              <Button variant="outline" className="border-slate-500 text-slate-200 hover:bg-white/10">
                <Mail className="h-4 w-4 mr-2" />
                Email Us
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
