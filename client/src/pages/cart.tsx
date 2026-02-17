import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Trash2, ShoppingCart, Percent, Shield, Loader2, CreditCard, Gem, Truck, Plus, MapPin, CalendarDays, Heart, Building2, Trophy, Check, Bitcoin } from "lucide-react";

export default function CartPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { items, addItem, removeItem, clearCart, subtotal, discount, total, hasMultipleItems, isInCart, itemCount } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBtcSubmitting, setIsBtcSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const hasServiceItems = items.some((i) => i.type === "service" || i.type === "promo");
  const hasSponsorItems = items.some((i) => i.type === "sponsor");
  const needsMoveInfo = hasServiceItems;

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    fromAddress: "",
    toAddress: "",
    moveDate: "",
    details: "",
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      toast({ title: "Your cart is empty", variant: "destructive" });
      return;
    }

    if (!form.firstName || !form.lastName || !form.email || !form.phone) {
      toast({ title: "Please fill in your contact info", variant: "destructive" });
      return;
    }
    if (needsMoveInfo && (!form.fromAddress || !form.moveDate)) {
      toast({ title: "Please fill in your address and preferred date", variant: "destructive" });
      return;
    }

    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, type: i.type })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.checkoutUrl) {
        clearCart();
        window.location.href = data.checkoutUrl;
      }
    } catch (error: any) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBtcCheckout = async () => {
    if (items.length === 0) {
      toast({ title: "Your cart is empty", variant: "destructive" });
      return;
    }
    if (!form.firstName || !form.lastName || !form.email || !form.phone) {
      toast({ title: "Please fill in your contact info", variant: "destructive" });
      return;
    }
    if (needsMoveInfo && (!form.fromAddress || !form.moveDate)) {
      toast({ title: "Please fill in your address and preferred date", variant: "destructive" });
      return;
    }
    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms", variant: "destructive" });
      return;
    }

    setIsBtcSubmitting(true);
    try {
      const res = await fetch("/api/btc/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: `${form.firstName} ${form.lastName}`,
          customerEmail: form.email,
          customerPhone: form.phone,
          usdAmount: total,
          referenceType: "cart",
          items: items.map((i) => ({ id: i.id, name: i.name, price: i.price, type: i.type })),
          notes: `${form.fromAddress ? `From: ${form.fromAddress}` : ""} ${form.toAddress ? `To: ${form.toAddress}` : ""} ${form.moveDate ? `Date: ${form.moveDate}` : ""} ${form.details || ""}`.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");
      clearCart();
      navigate(`/bitcoin-payment?id=${data.payment.id}`);
    } catch (error: any) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsBtcSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-slate-800 border-slate-600">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <ShoppingCart className="h-16 w-16 text-slate-500 mx-auto" />
            <h2 className="text-xl font-bold text-white">Your cart is empty</h2>
            <p className="text-slate-400 text-sm">Browse our services and jewelry to add items.</p>
            <div className="flex gap-3 pt-2">
              <Link href="/" className="flex-1">
                <Button variant="outline" className="w-full border-slate-500 text-slate-300 hover:text-white">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </Link>
              <Link href="/nature-made-jewls" className="flex-1">
                <Button className="w-full bg-purple-600 hover:bg-purple-700">
                  <Gem className="h-4 w-4 mr-2" />
                  Shop Jewls
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-emerald-400" />
          Your Cart
          {hasMultipleItems && (
            <span className="text-sm bg-emerald-600/30 text-emerald-300 px-3 py-1 rounded-full font-medium">
              10% Bundle Discount!
            </span>
          )}
        </h1>

        {/* Cart Items */}
        <Card className="bg-slate-800/80 border-slate-600 mb-4">
          <CardContent className="pt-4 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-600 flex items-center justify-center shrink-0">
                    {item.type === "jewelry" ? <Gem className="h-6 w-6 text-purple-400" /> : item.type === "sponsor" ? <Trophy className="h-6 w-6 text-yellow-400" /> : <Truck className="h-6 w-6 text-blue-400" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{item.name}</p>
                  <p className="text-slate-400 text-xs capitalize">{item.type === "promo" ? "Moving Service" : item.type === "sponsor" ? "Monthly Sponsorship" : item.type}</p>
                  <p className="text-yellow-400 font-bold">${item.price.toFixed(2)}</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-300 p-2">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Price Summary */}
        <Card className="bg-slate-800/80 border-emerald-500/30 mb-4">
          <CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal ({items.length} item{items.length > 1 ? "s" : ""})</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {hasMultipleItems && (
              <div className="flex justify-between text-emerald-400 font-medium">
                <span className="flex items-center gap-1">
                  <Percent className="h-3 w-3" />
                  10% Bundle Discount
                </span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-slate-600 pt-2 flex justify-between text-white font-bold text-lg">
              <span>Total</span>
              <span className="text-yellow-400">${total.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Sponsorship Upsell */}
        {!isInCart("sponsor-bronze") && !isInCart("sponsor-silver") && !isInCart("sponsor-gold") && (
          <Card className="bg-gradient-to-r from-yellow-900/30 to-amber-900/20 border-yellow-500/30 mb-4">
            <CardContent className="py-4">
              <p className="text-yellow-200 font-semibold text-sm text-center mb-3 flex items-center justify-center gap-2">
                <Trophy className="h-4 w-4" />
                Become a Sponsor — Support JC ON THE MOVE!
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "sponsor-bronze", name: "Bronze", price: 100, icon: Heart, color: "text-amber-300" },
                  { id: "sponsor-silver", name: "Silver", price: 250, icon: Building2, color: "text-slate-200" },
                  { id: "sponsor-gold", name: "Gold", price: 500, icon: Trophy, color: "text-yellow-300" },
                ].map((tier) => {
                  const Icon = tier.icon;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => {
                        addItem({ id: tier.id, name: `${tier.name} Sponsor (Monthly)`, price: tier.price, image: "", type: "sponsor" });
                        toast({ title: `${tier.name} Sponsorship added!`, description: "Bundle discount applied!" });
                      }}
                      className="bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/50 rounded-lg p-3 text-center transition-colors"
                    >
                      <Icon className={`h-5 w-5 ${tier.color} mx-auto mb-1`} />
                      <p className={`text-xs font-semibold ${tier.color}`}>{tier.name}</p>
                      <p className="text-white font-bold text-sm">${tier.price}<span className="text-slate-400 text-[10px]">/mo</span></p>
                      <p className="text-emerald-400 text-[10px] mt-0.5">+ Add</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add More Items */}
        <Card className="bg-emerald-900/20 border-emerald-500/30 border-dashed mb-6">
          <CardContent className="py-4">
            <p className="text-emerald-200 text-sm text-center mb-3">
              {hasMultipleItems ? "Keep adding items — your 10% discount applies automatically!" : "Add another item to unlock 10% bundle discount!"}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Link href="/nature-made-jewls">
                <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/30">
                  <Gem className="h-4 w-4 mr-1" />
                  Jewelry
                </Button>
              </Link>
              <Link href="/promo/half-day">
                <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/30">
                  <Truck className="h-4 w-4 mr-1" />
                  Moving
                </Button>
              </Link>
              <Link href="/sponsors">
                <Button size="sm" variant="outline" className="border-yellow-500/50 text-yellow-200 hover:bg-yellow-900/30">
                  <Trophy className="h-4 w-4 mr-1" />
                  Sponsor Us
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Customer Info Form */}
        <Card className="bg-slate-800/80 border-slate-600 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl text-white">Your Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">First Name *</Label>
                  <Input value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} placeholder="John" className="bg-slate-700 border-slate-600 text-white" required />
                </div>
                <div>
                  <Label className="text-white">Last Name *</Label>
                  <Input value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} placeholder="Doe" className="bg-slate-700 border-slate-600 text-white" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="john@example.com" className="bg-slate-700 border-slate-600 text-white" required />
                </div>
                <div>
                  <Label className="text-white">Phone *</Label>
                  <Input type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(906) 555-1234" className="bg-slate-700 border-slate-600 text-white" required />
                </div>
              </div>

              {needsMoveInfo && (
                <>
                  <div>
                    <Label className="text-white flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-400" />
                      Pickup Address *
                    </Label>
                    <Input value={form.fromAddress} onChange={(e) => updateField("fromAddress", e.target.value)} placeholder="123 Main St, Marquette, MI" className="bg-slate-700 border-slate-600 text-white" required />
                  </div>
                  <div>
                    <Label className="text-white flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-400" />
                      Drop-off Address (optional)
                    </Label>
                    <Input value={form.toAddress} onChange={(e) => updateField("toAddress", e.target.value)} placeholder="456 Oak Ave, Ishpeming, MI" className="bg-slate-700 border-slate-600 text-white" />
                  </div>
                  <div>
                    <Label className="text-white flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-yellow-400" />
                      Preferred Date *
                    </Label>
                    <Input type="date" value={form.moveDate} onChange={(e) => updateField("moveDate", e.target.value)} className="bg-slate-700 border-slate-600 text-white" min={new Date().toISOString().split("T")[0]} required />
                  </div>
                </>
              )}

              <div>
                <Label className="text-white">Notes (optional)</Label>
                <Textarea value={form.details} onChange={(e) => updateField("details", e.target.value)} placeholder="Any special instructions..." className="bg-slate-700 border-slate-600 text-white min-h-[60px]" />
              </div>

              {needsMoveInfo && (
                <Card className="bg-red-950/40 border-red-500/30">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                      <div className="text-sm text-red-200 space-y-1">
                        <p className="font-semibold text-red-100">Cancellation Policy</p>
                        <p>More than 48 hours: 10% or $100 fee (whichever is greater)</p>
                        <p>Within 48 hours: 25% cancellation fee</p>
                        <p>Within 24 hours: 50% cancellation fee</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="cart-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="mt-1 border-slate-500"
                />
                <label htmlFor="cart-terms" className="text-sm text-slate-300 cursor-pointer leading-relaxed">
                  I agree to the <Link href="/terms" className="text-blue-400 underline hover:text-blue-300">Terms of Service</Link>{needsMoveInfo ? " and cancellation policy" : ""}.
                </label>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={isSubmitting || !agreedToTerms}
                className="w-full py-6 text-lg font-bold bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 mr-2" />
                    Pay ${total.toFixed(2)}
                    {hasMultipleItems && (
                      <span className="ml-2 text-xs bg-black/20 px-2 py-0.5 rounded-full">
                        Save ${discount.toFixed(2)}
                      </span>
                    )}
                  </>
                )}
              </Button>

              <div className="relative flex items-center my-2">
                <div className="flex-1 border-t border-slate-600"></div>
                <span className="px-3 text-xs text-slate-500">or</span>
                <div className="flex-1 border-t border-slate-600"></div>
              </div>

              <Button
                onClick={handleBtcCheckout}
                disabled={isBtcSubmitting || !agreedToTerms}
                className="w-full py-6 text-lg font-bold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white shadow-lg"
              >
                {isBtcSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Creating BTC Payment...
                  </>
                ) : (
                  <>
                    <Bitcoin className="h-5 w-5 mr-2" />
                    Pay with Bitcoin
                    <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      Save 10%
                    </span>
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-slate-400">
                Secure payment processed by Square or Bitcoin
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
