import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Heart, Building2, Handshake, Mail, Phone, Loader2, ShoppingCart, Check, Star, Trophy, Megaphone, Truck as TruckIcon, Globe, Users, Bitcoin } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { FloatingCartButton } from "@/components/cart-button";

const sponsorTiers = [
  {
    id: "sponsor-bronze",
    name: "Bronze Sponsor",
    price: 100,
    color: "amber",
    icon: Heart,
    gradient: "from-amber-700 to-amber-900",
    border: "border-amber-500/60",
    ring: "",
    badge: "bg-amber-600",
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-300",
    titleColor: "text-amber-200",
    priceColor: "text-amber-100",
    perks: [
      "Logo on our website",
      "Social media shoutouts (monthly)",
      "Thank-you post on all platforms",
    ],
  },
  {
    id: "sponsor-silver",
    name: "Silver Sponsor",
    price: 250,
    color: "slate",
    icon: Building2,
    gradient: "from-slate-500 to-slate-700",
    border: "border-slate-400/60",
    ring: "ring-1 ring-slate-400/30",
    badge: "bg-slate-500",
    iconBg: "bg-slate-400/20",
    iconColor: "text-slate-200",
    titleColor: "text-slate-100",
    priceColor: "text-white",
    popular: true,
    perks: [
      "Everything in Bronze",
      "Logo decal on our trucks",
      "Featured in email newsletters",
      "Priority mention at events",
    ],
  },
  {
    id: "sponsor-gold",
    name: "Gold Sponsor",
    price: 500,
    color: "yellow",
    icon: Trophy,
    gradient: "from-yellow-600 to-yellow-800",
    border: "border-yellow-400/60",
    ring: "ring-2 ring-yellow-400/40",
    badge: "bg-yellow-500",
    iconBg: "bg-yellow-400/20",
    iconColor: "text-yellow-200",
    titleColor: "text-yellow-100",
    priceColor: "text-yellow-50",
    perks: [
      "Everything in Silver",
      "Featured partner status",
      "Co-branded marketing materials",
      "VIP event invitations",
      "Dedicated partner page on site",
    ],
  },
];

export default function SponsorsPage() {
  const { toast } = useToast();
  const { addItem, isInCart, removeItem, itemCount } = useCart();
  const [checkoutTier, setCheckoutTier] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDirectCheckout = async (tier: typeof sponsorTiers[0]) => {
    if (!form.businessName || !form.contactName || !form.email || !form.phone) {
      toast({ title: "Please fill in all contact fields", variant: "destructive" });
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
          tierId: tier.id,
          tierName: tier.name,
          tierPrice: tier.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error: any) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddToCart = (tier: typeof sponsorTiers[0]) => {
    const cartId = tier.id;
    if (isInCart(cartId)) {
      removeItem(cartId);
      toast({ title: `${tier.name} removed from cart` });
    } else {
      addItem({
        id: cartId,
        name: `${tier.name} (Monthly)`,
        price: tier.price,
        image: "",
        type: "sponsor",
      });
      toast({
        title: `${tier.name} added to cart!`,
        description: itemCount > 0 ? "10% stacking discount on additional items!" : "Add more items for 10% stacking discount",
      });
    }
  };

  const activeTier = checkoutTier ? sponsorTiers.find((t) => t.id === checkoutTier) : null;

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-10">
          {sponsorTiers.map((tier) => {
            const Icon = tier.icon;
            const inCart = isInCart(tier.id);
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

                  <h3 className={`text-xl font-bold ${tier.titleColor} mb-1`}>{tier.name}</h3>
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

                  <div className="space-y-2">
                    <Button
                      className={`w-full text-sm font-semibold py-4 ${
                        inCart
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-emerald-500 hover:bg-emerald-600 text-white"
                      }`}
                      onClick={() => handleAddToCart(tier)}
                    >
                      {inCart ? (
                        <><Check className="h-4 w-4 mr-1" /> In Cart</>
                      ) : (
                        <><ShoppingCart className="h-4 w-4 mr-1" /> Add to Cart</>
                      )}
                    </Button>
                    <a href="/bitcoin-payment" className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 transition-colors">
                      <Bitcoin className="h-4 w-4 text-orange-400" />
                      <span className="text-orange-300 text-sm font-medium">Pay with Bitcoin</span>
                      <span className="inline-flex items-center bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Save 10%</span>
                    </a>
                    {inCart && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-950/40 border border-orange-500/30">
                        <Bitcoin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                        <p className="text-orange-300/90 text-xs">Added! Pay with Bitcoin at checkout to <span className="font-bold text-orange-300">save 10%</span></p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {checkoutTier && activeTier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setCheckoutTier(null); setAgreedToTerms(false); }} />
            <Card className="relative z-50 w-full max-w-md bg-slate-800 border-slate-600 shadow-2xl max-h-[90vh] overflow-y-auto">
              <CardContent className="p-6">
                <button
                  onClick={() => { setCheckoutTier(null); setAgreedToTerms(false); }}
                  className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl"
                >
                  ✕
                </button>

                <div className="text-center mb-5">
                  <div className={`${activeTier.iconBg} p-3 rounded-xl w-fit mx-auto mb-3`}>
                    {(() => { const Icon = activeTier.icon; return <Icon className={`h-8 w-8 ${activeTier.iconColor}`} />; })()}
                  </div>
                  <h2 className="text-xl font-bold text-white">{activeTier.name}</h2>
                  <p className="text-2xl font-extrabold text-yellow-400 mt-1">${activeTier.price}/month</p>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <Label className="text-white text-sm">Business Name *</Label>
                    <Input value={form.businessName} onChange={(e) => updateField("businessName", e.target.value)} placeholder="Your Business LLC" className="bg-slate-700 border-slate-600 text-white" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Contact Name *</Label>
                    <Input value={form.contactName} onChange={(e) => updateField("contactName", e.target.value)} placeholder="John Doe" className="bg-slate-700 border-slate-600 text-white" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="you@business.com" className="bg-slate-700 border-slate-600 text-white" />
                  </div>
                  <div>
                    <Label className="text-white text-sm">Phone *</Label>
                    <Input type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(906) 555-1234" className="bg-slate-700 border-slate-600 text-white" />
                  </div>
                </div>

                <div className="flex items-start space-x-3 mb-4">
                  <Checkbox
                    id="sponsor-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-1 border-slate-500"
                  />
                  <label htmlFor="sponsor-terms" className="text-xs text-slate-300 cursor-pointer leading-relaxed">
                    I agree to the <Link href="/terms" className="text-blue-400 underline">Terms of Service</Link>. This is a monthly sponsorship billed via Square.
                  </label>
                </div>

                <Button
                  onClick={() => handleDirectCheckout(activeTier)}
                  disabled={isSubmitting || !agreedToTerms}
                  className="w-full py-5 text-base font-bold bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    <><CreditCard className="h-5 w-5 mr-2" /> Pay ${activeTier.price} Now</>
                  )}
                </Button>
                <p className="text-center text-xs text-slate-400 mt-2">Secure payment via Square</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <Globe className="h-8 w-8 text-blue-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Website & Social</p>
            <p className="text-slate-400 text-xs mt-1">Your brand reaches our entire online audience</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <TruckIcon className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Moving Trucks</p>
            <p className="text-slate-400 text-xs mt-1">Your logo on trucks seen across the UP daily</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-5 text-center border border-slate-700/50">
            <Users className="h-8 w-8 text-purple-400 mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">Community Events</p>
            <p className="text-slate-400 text-xs mt-1">Be recognized at local events and gatherings</p>
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-5">Current Sponsors</h2>
          <Card className="bg-slate-800/40 border-slate-700/50 border-dashed">
            <CardContent className="py-10">
              <Star className="h-10 w-10 text-yellow-500/40 mx-auto mb-3" />
              <p className="text-slate-300 text-lg font-medium">Be the first to sponsor JC ON THE MOVE!</p>
              <p className="text-slate-500 text-sm mt-1">Your logo and brand featured right here.</p>
            </CardContent>
          </Card>
        </div>

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
      <FloatingCartButton />
    </div>
  );
}
