import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Truck, Clock, Users, MapPin, CalendarDays, Shield, Loader2 } from "lucide-react";
import promoImage from "@assets/file_00000000839871fd8e13378301744f2e_(1)_1771260918919.png";

export default function PromoHalfDayPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

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
        body: JSON.stringify(form),
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
                      <p>More than 48 hours before: $10 processing fee or $100, whichever is greater</p>
                      <p>Within 48 hours: 25% cancellation fee ($150)</p>
                      <p>Within 24 hours: 50% cancellation fee ($300)</p>
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
                    Pay $600 & Book Now
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-slate-400">
                Secure payment processed by Square. You'll be redirected to complete payment.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
