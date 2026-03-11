import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Truck, Clock, Users, MapPin, CalendarDays, Shield, Loader2, Plus, X, Percent, Gem, ShoppingCart, Check, UserPlus, Timer, Bitcoin } from "lucide-react";
import promoImage from "@assets/file_00000000839871fd8e13378301744f2e_(1)_1771260918919.png";
import truckImage from "@assets/file_00000000219471fdb0d2dab84a32d060_1771261914341.png";
import { useCart } from "@/hooks/useCart";
import { FloatingCartButton } from "@/components/cart-button";

interface AddOnItem {
  id: string;
  name: string;
  price: number;
  image: string;
  type: "service" | "jewelry";
}

export default function PromoHalfDayPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [addOns, setAddOns] = useState<AddOnItem[]>([]);
  const [showJewelry, setShowJewelry] = useState(false);
  const { addItem: addToCart, isInCart, removeItem: removeFromCart, itemCount: cartCount } = useCart();
  const promoCartId = "promo-half-day";
  const promoInCart = isInCart(promoCartId);

  const { data: jewelryItems } = useQuery<any[]>({
    queryKey: ["/api/jewelry"],
  });

  const availableJewelry = jewelryItems?.filter((j: any) => j.inStock && !j.soldAt && j.price) || [];

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

  const basePrice = 600;
  const addOnsSubtotal = addOns.reduce((sum, item) => sum + item.price, 0);
  const discount = addOns.length > 0 ? Math.round(addOnsSubtotal * 0.1 * 100) / 100 : 0;
  const totalPrice = basePrice + addOnsSubtotal - discount;

  const toggleAddOn = (item: AddOnItem) => {
    setAddOns((prev) => {
      const exists = prev.find((a) => a.id === item.id);
      if (exists) {
        return prev.filter((a) => a.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const isAddOnSelected = (id: string) => addOns.some((a) => a.id === id);

  const truckRental: AddOnItem = {
    id: "truck-rental",
    name: "U-Haul Truck Rental (Local)",
    price: 200,
    image: truckImage,
    type: "service",
  };

  const serviceAddOns: (AddOnItem & { icon: any; description: string })[] = [
    { ...truckRental, icon: Truck, description: "Local jobs only" },
    { id: "extra-mover", name: "Extra Mover", price: 75, image: "", type: "service", icon: UserPlus, description: "Add a 4th crew member" },
    { id: "extra-hour", name: "Extra Hour of Help", price: 100, image: "", type: "service", icon: Timer, description: "Extend to 5 hours total" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.fromAddress || !form.moveDate) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (!agreedToTerms) {
      toast({ title: "Please agree to the terms and cancellation policy", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/promo/half-day-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: a.price, type: a.type })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error: any) {
      toast({ title: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="relative mb-6 rounded-2xl overflow-hidden shadow-2xl border-2 border-yellow-400/50">
          <div className="absolute top-4 left-4 z-10">
            <span className="bg-yellow-500 text-black font-extrabold text-sm px-4 py-1.5 rounded-full shadow-lg uppercase tracking-wider animate-pulse">
              Best Value — Monthly Special
            </span>
          </div>
          <img
            src={promoImage}
            alt="Half Day Loading/Unloading - 3 movers, 4 hours, travel time included - $600"
            className="w-full object-cover max-h-[500px]"
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-900/40 border-blue-500/30 text-center">
            <CardContent className="pt-5 pb-4">
              <Users className="h-8 w-8 text-blue-300 mx-auto mb-2" />
              <p className="text-white font-bold text-lg">3 Movers</p>
              <p className="text-blue-200 text-sm">Professional crew</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-900/40 border-amber-500/30 text-center">
            <CardContent className="pt-5 pb-4">
              <Clock className="h-8 w-8 text-amber-300 mx-auto mb-2" />
              <p className="text-white font-bold text-lg">4 Hours</p>
              <p className="text-amber-200 text-sm">Travel time included</p>
            </CardContent>
          </Card>
          <Card className="bg-green-900/40 border-green-500/30 text-center">
            <CardContent className="pt-5 pb-4">
              <Truck className="h-8 w-8 text-green-300 mx-auto mb-2" />
              <p className="text-white font-bold text-lg">$600 Flat</p>
              <p className="text-green-200 text-sm">No hidden fees</p>
            </CardContent>
          </Card>
        </div>

        {/* Add-On Items Section */}
        <Card className="bg-gradient-to-br from-purple-950/80 to-indigo-950/70 border-purple-500/40 shadow-xl mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-white flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-full">
                <Plus className="h-5 w-5 text-purple-300" />
              </div>
              Add an Item & Save 10%
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Percent className="h-4 w-4 text-purple-300" />
              <p className="text-purple-200 text-sm font-medium">
                Bundle any add-on with your move and get 10% off the add-on price!
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {serviceAddOns.map((addon) => {
              const selected = isAddOnSelected(addon.id);
              const discountedPrice = Math.round(addon.price * 0.9 * 100) / 100;
              const Icon = addon.icon;
              return (
                <div
                  key={addon.id}
                  onClick={() => toggleAddOn(addon)}
                  className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    selected
                      ? "bg-purple-600/30 border-2 border-purple-400 shadow-lg"
                      : "bg-slate-800/60 border-2 border-slate-600/50 hover:border-purple-500/50"
                  }`}
                >
                  {addon.image ? (
                    <img
                      src={addon.image}
                      alt={addon.name}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-purple-900/50 flex items-center justify-center shrink-0">
                      <Icon className="h-7 w-7 text-purple-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{addon.name}</p>
                    <p className="text-slate-400 text-xs">{addon.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-yellow-400 font-bold">${addon.price}</span>
                      {selected && (
                        <span className="text-purple-300 text-sm font-medium">-10% = ${discountedPrice}</span>
                      )}
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    selected
                      ? "bg-purple-500 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}>
                    {selected ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </div>
                </div>
              );
            })}

            {/* Browse Jewelry Toggle */}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowJewelry(!showJewelry)}
                className="w-full bg-slate-800/60 border-amber-500/40 text-amber-200 hover:bg-amber-900/30 hover:text-amber-100"
              >
                <Gem className="h-4 w-4 mr-2" />
                {showJewelry ? "Hide" : "Browse"} Nature Made Jewls
                <span className="ml-2 text-xs text-amber-400">({availableJewelry.length} items)</span>
              </Button>
            </div>

            {/* Jewelry Items Grid */}
            {showJewelry && availableJewelry.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableJewelry.map((item: any) => {
                  const selected = isAddOnSelected(`jewelry-${item.id}`);
                  const itemPrice = parseFloat(item.price);
                  return (
                    <div
                      key={item.id}
                      onClick={() =>
                        toggleAddOn({
                          id: `jewelry-${item.id}`,
                          name: item.title,
                          price: itemPrice,
                          image: item.imageUrl || "",
                          type: "jewelry",
                        })
                      }
                      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                        selected
                          ? "ring-2 ring-purple-400 shadow-lg shadow-purple-500/20"
                          : "hover:ring-1 hover:ring-purple-500/50"
                      }`}
                    >
                      <div className="aspect-square bg-slate-800">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-2 bg-slate-800/90">
                        <p className="text-white text-xs font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-400 font-bold text-sm">${itemPrice.toFixed(2)}</span>
                          {selected && (
                            <span className="text-purple-300 text-xs">-10%</span>
                          )}
                        </div>
                      </div>
                      {selected && (
                        <div className="absolute top-2 right-2 bg-purple-500 rounded-full p-1">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cart Summary */}
            {addOns.length > 0 && (
              <Card className="bg-slate-900/80 border-purple-500/30">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-4 w-4 text-purple-300" />
                    <p className="text-purple-200 font-semibold text-sm">Your Bundle</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-300">
                      <span>Half Day Move</span>
                      <span className="text-white font-medium">${basePrice.toFixed(2)}</span>
                    </div>
                    {addOns.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-slate-300">
                        <span className="flex items-center gap-2 truncate pr-2">
                          {item.name}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAddOn(item);
                            }}
                            className="text-red-400 hover:text-red-300 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                        <span className="text-white font-medium shrink-0">${item.price.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-purple-500/30 pt-2 flex justify-between text-purple-300">
                      <span className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        10% Stacking Discount (items #2+)
                      </span>
                      <span className="font-medium">-${discount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-slate-600 pt-2 flex justify-between text-white font-bold text-base">
                      <span>Total</span>
                      <span className="text-yellow-400">${totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 border-slate-600 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-white flex items-center gap-3">
              <CalendarDays className="h-7 w-7 text-yellow-400" />
              Book Your Half Day Move
            </CardTitle>
            <p className="text-slate-300 text-sm">
              Fill in your details below. After payment, this will be added to our schedule as a confirmed job.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">First Name *</Label>
                  <Input
                    value={form.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    placeholder="John"
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                  />
                </div>
                <div>
                  <Label className="text-white">Last Name *</Label>
                  <Input
                    value={form.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    placeholder="Doe"
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="john@example.com"
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                  />
                </div>
                <div>
                  <Label className="text-white">Phone *</Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="(906) 555-1234"
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-white flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-400" />
                  Pickup Address *
                </Label>
                <Input
                  value={form.fromAddress}
                  onChange={(e) => updateField("fromAddress", e.target.value)}
                  placeholder="123 Main St, Marquette, MI 49855"
                  className="bg-slate-700 border-slate-600 text-white"
                  required
                />
              </div>

              <div>
                <Label className="text-white flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-400" />
                  Drop-off Address (optional)
                </Label>
                <Input
                  value={form.toAddress}
                  onChange={(e) => updateField("toAddress", e.target.value)}
                  placeholder="456 Oak Ave, Ishpeming, MI 49849"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>

              <div>
                <Label className="text-white flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-yellow-400" />
                  Preferred Move Date *
                </Label>
                <Input
                  type="date"
                  value={form.moveDate}
                  onChange={(e) => updateField("moveDate", e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>

              <div>
                <Label className="text-white">Special Instructions / Details</Label>
                <Textarea
                  value={form.details}
                  onChange={(e) => updateField("details", e.target.value)}
                  placeholder="Stairs, heavy items, anything we should know..."
                  className="bg-slate-700 border-slate-600 text-white min-h-[80px]"
                />
              </div>

              <Card className="bg-red-950/40 border-red-500/30">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-red-200 space-y-1">
                      <p className="font-semibold text-red-100">Cancellation Policy</p>
                      <p>More than 48 hours before: 10% processing fee or $100, whichever is greater</p>
                      <p>Within 48 hours: 25% cancellation fee</p>
                      <p>Within 24 hours: 50% cancellation fee</p>
                      <p className="text-xs text-red-300 mt-1">
                        Full policy in our <Link href="/terms" className="underline hover:text-white">Terms of Service</Link>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="mt-1 border-slate-500"
                />
                <label htmlFor="terms" className="text-sm text-slate-300 cursor-pointer leading-relaxed">
                  I agree to the <Link href="/terms" className="text-blue-400 underline hover:text-blue-300">Terms of Service</Link> and cancellation policy. I understand that cancellation fees apply as outlined above.
                </label>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !agreedToTerms}
                className="w-full py-6 text-lg font-bold bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Creating Checkout...
                  </>
                ) : (
                  <>
                    <Truck className="h-5 w-5 mr-2" />
                    Pay ${totalPrice.toFixed(2)} & Book Now
                    {addOns.length > 0 && (
                      <span className="ml-2 text-xs bg-black/20 px-2 py-0.5 rounded-full">
                        Save ${discount.toFixed(2)}
                      </span>
                    )}
                  </>
                )}
              </Button>

              <div className="relative flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-slate-600" />
                <span className="text-xs text-slate-400">or</span>
                <div className="flex-1 border-t border-slate-600" />
              </div>

              <Button
                type="button"
                variant={promoInCart ? "default" : "outline"}
                className={`w-full py-5 text-sm font-semibold ${
                  promoInCart
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/30"
                }`}
                onClick={() => {
                  if (promoInCart) {
                    removeFromCart(promoCartId);
                    toast({ title: "Removed from cart" });
                  } else {
                    addToCart({
                      id: promoCartId,
                      name: "Half Day Loading/Unloading - 3 Movers, 4 Hours",
                      price: 600,
                      image: promoImage,
                      type: "promo",
                    });
                    toast({ title: "Added to cart!", description: cartCount > 0 ? "Stacking discount applied at checkout!" : "Add more items for 10% stacking discount" });
                  }
                }}
              >
                {promoInCart ? (
                  <><Check className="h-4 w-4 mr-2" /> In Cart{cartCount > 1 ? " — 10% Bundle!" : ""}</>
                ) : (
                  <><ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart{cartCount > 0 ? " — Save 10%" : " Instead"}</>
                )}
              </Button>

              <a href="/bitcoin-payment" className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 transition-colors">
                <Bitcoin className="h-4 w-4 text-orange-400" />
                <span className="text-orange-300 text-sm font-medium">Pay with Bitcoin</span>
                <span className="inline-flex items-center bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Save 10%</span>
              </a>

              {promoInCart && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-950/40 border border-orange-500/30">
                  <Bitcoin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                  <p className="text-orange-300/90 text-xs">Added! Pay with Bitcoin at checkout to <span className="font-bold text-orange-300">save 10%</span></p>
                </div>
              )}

              <p className="text-center text-xs text-slate-400">
                Secure payment processed by Square. You'll be redirected to complete payment.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
      <FloatingCartButton />
    </div>
  );
}
