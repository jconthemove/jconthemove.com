import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket,
  CheckCircle2, Star, Shield, Zap, MapPin, Phone, Send, Gift, ChevronRight, Calculator, MessageSquare
} from "lucide-react";
import { Link } from "wouter";
import { HomepageBookingCalculator } from "@/components/homepage-booking-calculator";
import { BookingChatbot } from "@/components/booking-chatbot";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertLeadSchema, type InsertLead } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import job1 from "@assets/20210401_100524_HDR_1764946073184.jpg";
import job2 from "@assets/20210401_100531_HDR_1764946073186.jpg";
import job3 from "@assets/FB_IMG_1675268568106_1758501643336.jpg";

const jewelryVideoSrc = "/jewelry-video.mp4";

const serviceOptions = [
  { value: "residential", label: "Moving", icon: Truck },
  { value: "junk", label: "Junk Removal", icon: Trash2 },
  { value: "snow", label: "Snow Removal", icon: Snowflake },
  { value: "cleaning", label: "Move In/Out", icon: Sparkles },
  { value: "handyman", label: "Handyman", icon: Wrench },
  { value: "demolition", label: "Light Demo", icon: HardHat },
  { value: "flooring", label: "Flooring", icon: Layers },
  { value: "painting", label: "Painting", icon: PaintBucket },
];

const recentJobs = [
  {
    photo: job1,
    crew: 2,
    hours: 3,
    price: 450,
    label: "2 Movers · 3 Hours",
  },
  {
    photo: job2,
    crew: 3,
    hours: 4,
    price: 600,
    label: "3 Movers · 4 Hours",
  },
  {
    photo: job3,
    crew: 1,
    hours: 2,
    price: 150,
    label: "Junk Removal · Same-Day",
  },
];

const testimonials = [
  {
    name: "Sarah M.",
    service: "Moving",
    quote: "Fast, careful, and professional. Highly recommend.",
    rating: 5,
  },
  {
    name: "James D.",
    service: "Moving",
    quote: "Best movers in the Northwoods. Showed up on time and got it done.",
    rating: 5,
  },
  {
    name: "Linda K.",
    service: "Moving",
    quote: "Easy booking, clear pricing, and a crew that works hard.",
    rating: 5,
  },
];

export default function HomePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null);
  const [entryMode, setEntryMode] = useState<"calculator" | "guided">("calculator");
  const [quoteOpen, setQuoteOpen] = useState(false);

  function scrollToGetStarted(mode: "calculator" | "guided" = "calculator") {
    setEntryMode(mode);
    const el = document.getElementById("get-started");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      serviceType: "",
      fromAddress: "",
      toAddress: "",
      moveDate: "",
      propertySize: "",
      details: "",
      promoCode: "",
      smsConsent: false,
    },
  });

  const submitLead = useMutation({
    mutationFn: async (data: InsertLead) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote request submitted!",
        description: "We will contact you within 24 hours with your quote.",
      });
      form.reset();
      setPhotoFiles(null);
      setQuoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      if (error.message.includes("401")) return;
      toast({
        title: "Error",
        description: "Failed to submit quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLead) => {
    submitLead.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">

      {/* Nature Made Jewls — Top Dedication Banner (preserved) */}
      <Link href="/nature-made-jewls">
        <div className="w-full cursor-pointer group relative overflow-hidden"
          style={{ background: "linear-gradient(90deg, #0d0704 0%, #2d1a0f 25%, #1e1208 50%, #2d1a0f 75%, #0d0704 100%)" }}>
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "repeating-linear-gradient(60deg, transparent, transparent 3px, rgba(180,100,30,0.12) 3px, rgba(180,100,30,0.12) 6px)" }} />
          <div className="relative flex items-center justify-between px-4 py-2.5 max-w-5xl mx-auto gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-amber-700/50 shadow">
                <video src={jewelryVideoSrc} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-amber-400/80 text-[9px] uppercase tracking-widest leading-none mb-0.5">Dedicated with love ♡</p>
                <p className="text-amber-100 font-serif font-bold text-sm md:text-base leading-tight truncate"
                  style={{ fontFamily: "'Georgia', serif" }}>
                  Nature Made Jewls — Handmade Jewelry &amp; Custom Creations
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                {["Copper Wire", "Natural Stone", "Custom Designs"].map(f => (
                  <span key={f} className="flex items-center gap-1 text-amber-100/70 text-[10px]">
                    <CheckCircle2 className="h-2.5 w-2.5 text-amber-500" />{f}
                  </span>
                ))}
              </div>
              <span className="text-amber-400 text-xs font-semibold group-hover:underline whitespace-nowrap">
                Shop Now →
              </span>
            </div>
            <span className="sm:hidden text-amber-400 text-xs font-semibold group-hover:underline flex-shrink-0">
              Shop →
            </span>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />
        </div>
      </Link>

      {/* ── HERO SECTION ── */}
      <section className="px-4 pt-10 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[1fr_380px] gap-8 items-center">

            {/* Left: Headline + trust badges + CTAs */}
            <div>
              <div className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-400/30 rounded-full px-3 py-1 mb-4">
                <MapPin className="h-3 w-3 text-blue-400" />
                <span className="text-blue-300 text-xs font-medium">Ironwood, Iron River, Green Bay, Wausau, and surrounding Northwoods areas</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4">
                Fast, Reliable Moving<br />
                <span className="text-blue-400">in the Northwoods</span>
              </h1>
              <p className="text-slate-300 text-lg mb-6">
                Moving, junk removal, and labor help across Ironwood and surrounding areas. Licensed, insured, and ready to work today.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {[
                  { icon: Shield, label: "Licensed & Insured" },
                  { icon: Star, label: "5-Star Local Reputation" },
                  { icon: Zap, label: "Fast Response" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-white/80 text-xs font-medium">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => scrollToGetStarted("calculator")}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 text-base rounded-xl"
                >
                  Get Instant Quote
                </Button>
                <a href="tel:+19063859312">
                  <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700 font-bold px-6 py-2.5 text-base rounded-xl">
                    <Phone className="h-4 w-4 mr-2" />
                    Call Now (906) 385-9312
                  </Button>
                </a>
              </div>
              <p className="mt-3 text-slate-500 text-xs">Next openings available today. Book now to lock your spot.</p>
            </div>

            {/* Right: Quick Book panel */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-2xl">
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Quick Book</p>
              <h2 className="text-white font-bold text-xl mb-1">Start Here — Price Your Move Fast</h2>
              <p className="text-slate-400 text-sm mb-4">Pick a starting option, then finish your quote in seconds.</p>
              <div className="space-y-2.5">
                <button onClick={() => scrollToGetStarted("calculator")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-slate-700/60 hover:bg-blue-600/20 border border-slate-600/60 hover:border-blue-500/60 rounded-xl px-4 py-3 cursor-pointer transition-all group">
                    <div>
                      <p className="text-white font-semibold text-sm">2 Movers — from $300</p>
                      <p className="text-slate-400 text-xs">2-hour minimum · best for small moves</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                  </div>
                </button>
                <button onClick={() => scrollToGetStarted("calculator")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-blue-600/20 border border-blue-500/60 rounded-xl px-4 py-3 cursor-pointer hover:bg-blue-600/30 transition-all group relative">
                    <div className="absolute -top-2 left-4">
                      <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Most Popular</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm pt-1">3 Movers — Most Popular</p>
                      <p className="text-blue-200 text-xs">Flexible duration · takes top jobs</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-white transition-colors" />
                  </div>
                </button>
                <button onClick={() => scrollToGetStarted("guided")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-slate-700/60 hover:bg-orange-500/20 border border-slate-600/60 hover:border-orange-500/60 rounded-xl px-4 py-3 cursor-pointer transition-all group">
                    <div>
                      <p className="text-white font-semibold text-sm">Junk Removal — from $150</p>
                      <p className="text-slate-400 text-xs">Fast local pickup</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY PEOPLE CHOOSE US ── */}
      <section className="py-10 px-4 bg-slate-950/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest text-center mb-2">Trust</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">Why People Choose JC ON THE MOVE</h2>

          {/* Stat blocks */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { value: "500+", label: "Jobs Completed" },
              { value: "5.0", label: "Average Rating" },
              { value: "Same-Day", label: "Availability" },
              { value: "Ironwood", label: "Based in Ironwood, MI" },
            ].map(({ value, label }) => (
              <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-white font-extrabold text-2xl md:text-3xl">{value}</p>
                <p className="text-slate-400 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Trust lines */}
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
            {[
              "No hidden fees.",
              "Professional, uniformed crews.",
              "Fast scheduling & clear communication.",
            ].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-300 text-sm">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RECENT JOBS ── */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Recent Jobs</p>
          <h2 className="text-2xl font-bold text-white mb-1">Recent Jobs</h2>
          <p className="text-slate-400 text-sm mb-6">Real work from our crew across the Northwoods.</p>

          <div className="grid md:grid-cols-3 gap-4">
            {recentJobs.map((job, i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg group">
                <img
                  src={job.photo}
                  alt={job.label}
                  className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4">
                  <p className="text-white font-semibold text-sm">{job.label}</p>
                  <p className="text-emerald-400 font-bold">${job.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GET STARTED — UNIFIED ENTRY SECTION ── */}
      <section id="get-started" className="py-10 px-4 bg-slate-950/60">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[1fr_300px] gap-8 items-start">

            {/* Left: Tabbed entry (calculator or guided chatbot) */}
            <div>
              {/* Section label */}
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Get Started</p>
              <h2 className="text-white font-bold text-2xl mb-4">How would you like to begin?</h2>

              {/* Tab switch */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <button
                  onClick={() => setEntryMode("calculator")}
                  className={`flex-1 flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    entryMode === "calculator"
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <Calculator className={`h-5 w-5 mt-0.5 shrink-0 ${entryMode === "calculator" ? "text-blue-400" : "text-slate-500"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${entryMode === "calculator" ? "text-white" : "text-slate-300"}`}>Instant Pricing</p>
                    <p className="text-slate-500 text-xs mt-0.5">Know roughly what you need? Build your move and see pricing now.</p>
                  </div>
                </button>
                <button
                  onClick={() => setEntryMode("guided")}
                  className={`flex-1 flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    entryMode === "guided"
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <MessageSquare className={`h-5 w-5 mt-0.5 shrink-0 ${entryMode === "guided" ? "text-teal-400" : "text-slate-500"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${entryMode === "guided" ? "text-white" : "text-slate-300"}`}>Guided Questions</p>
                    <p className="text-slate-500 text-xs mt-0.5">Not sure what service fits? We'll ask a few quick questions and help you figure it out.</p>
                  </div>
                </button>
              </div>

              {/* Tab content */}
              {entryMode === "calculator" ? (
                <HomepageBookingCalculator />
              ) : (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                  <BookingChatbot embedded />
                </div>
              )}
            </div>

            {/* Right: Services Snapshot */}
            <div>
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Services Snapshot</p>
              <h3 className="text-white font-bold text-xl mb-2">What We Do Most</h3>
              <p className="text-slate-400 text-sm mb-5">The services people turn to us for every day.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Truck, label: "Moving", sub: "Tap to price a move", mode: "calculator" as const, iconCls: "text-blue-400", borderCls: "hover:border-blue-500/50" },
                  { icon: Trash2, label: "Junk Removal", sub: "Tap to get a quote", mode: "guided" as const, iconCls: "text-orange-400", borderCls: "hover:border-orange-500/50" },
                  { icon: Sparkles, label: "Labor Help", sub: "Tap to get a quote", mode: "guided" as const, iconCls: "text-teal-400", borderCls: "hover:border-teal-500/50" },
                  { icon: Snowflake, label: "Snow Removal", sub: "Tap to request service", mode: "guided" as const, iconCls: "text-cyan-400", borderCls: "hover:border-cyan-500/50" },
                ].map(({ icon: Icon, label, sub, mode, iconCls, borderCls }) => (
                  <button key={label} onClick={() => scrollToGetStarted(mode)} className="text-left">
                    <div className={`bg-slate-800/60 border border-slate-700/50 ${borderCls} rounded-xl p-4 cursor-pointer hover:bg-slate-700/60 transition-all group`}>
                      <Icon className={`h-7 w-7 ${iconCls} mb-2`} />
                      <p className="text-white font-semibold text-sm">{label}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom quote strip */}
              <button
                onClick={() => setQuoteOpen(true)}
                className="mt-4 w-full flex items-center gap-3 bg-slate-800/60 border border-dashed border-slate-600/70 hover:border-blue-500/60 hover:bg-slate-700/60 rounded-xl px-4 py-3 text-left transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/25 transition-colors">
                  <Send className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">Need a custom quote?</p>
                  <p className="text-slate-500 text-xs mt-0.5">Specialty jobs, large moves, or anything unique</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-blue-400 ml-auto flex-shrink-0 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest text-center mb-2">Testimonials</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-2">What Customers Say</h2>
          <p className="text-slate-400 text-sm text-center mb-8">Short, honest proof from recent customers.</p>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-200 text-sm italic mb-4">"{t.quote}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.service}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CUSTOM QUOTE DIALOG ── */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">Need a Custom Quote?</DialogTitle>
            <p className="text-slate-400 text-sm">For specialty jobs, large moves, or anything outside the calculator — send us your details and we'll be in touch within 24 hours.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { icon: Shield, label: "Licensed & Insured" },
                { icon: Zap, label: "Fast response" },
                { icon: CheckCircle2, label: "No obligation" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Icon className="h-3 w-3 text-blue-400" />{label}
                </div>
              ))}
            </div>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">

                {/* Service Type */}
                <div>
                  <Label className="block text-sm font-medium text-white mb-3">Service Type *</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {serviceOptions.map((service) => {
                      const IconComponent = service.icon;
                      return (
                        <label key={service.value} className="relative cursor-pointer">
                          <input
                            type="radio"
                            value={service.value}
                            className="peer sr-only"
                            {...form.register("serviceType", { required: true })}
                          />
                          <div className="p-3 border border-slate-600 rounded-xl cursor-pointer peer-checked:border-blue-500 peer-checked:bg-blue-500/10 transition-colors text-center">
                            <IconComponent className="h-6 w-6 text-blue-400 mx-auto mb-1" />
                            <span className="text-slate-200 text-xs font-medium block">{service.label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {form.formState.errors.serviceType && (
                    <p className="text-red-400 text-xs mt-1">Service type is required</p>
                  )}
                </div>

                {/* Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-slate-300 text-sm mb-1.5 block">First Name *</Label>
                    <Input
                      id="firstName"
                      placeholder="Enter your first name"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("firstName")}
                    />
                    {form.formState.errors.firstName && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-slate-300 text-sm mb-1.5 block">Last Name *</Label>
                    <Input
                      id="lastName"
                      placeholder="Enter your last name"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("lastName")}
                    />
                    {form.formState.errors.lastName && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="text-slate-300 text-sm mb-1.5 block">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-300 text-sm mb-1.5 block">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("phone")}
                    />
                    {form.formState.errors.phone && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>

                {/* Addresses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fromAddress" className="text-slate-300 text-sm mb-1.5 block">Service Address *</Label>
                    <Input
                      id="fromAddress"
                      placeholder="Where do you need service?"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("fromAddress")}
                    />
                    {form.formState.errors.fromAddress && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.fromAddress.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="toAddress" className="text-slate-300 text-sm mb-1.5 block">Destination (if moving)</Label>
                    <Input
                      id="toAddress"
                      placeholder="Destination address"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("toAddress")}
                    />
                  </div>
                </div>

                {/* Date + Property Size */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="moveDate" className="text-slate-300 text-sm mb-1.5 block">Preferred Date</Label>
                    <Input
                      id="moveDate"
                      type="date"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("moveDate")}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm mb-1.5 block">Property Size</Label>
                    <Select onValueChange={(value) => form.setValue("propertySize", value)}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-300 focus:border-blue-500">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="studio">Studio/1 BR</SelectItem>
                        <SelectItem value="2br">2-3 Bedroom</SelectItem>
                        <SelectItem value="4br">4+ Bedroom</SelectItem>
                        <SelectItem value="office">Small Office</SelectItem>
                        <SelectItem value="large-office">Large Office</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Details */}
                <div>
                  <Label htmlFor="details" className="text-slate-300 text-sm mb-1.5 block">Additional Details</Label>
                  <Textarea
                    id="details"
                    rows={3}
                    placeholder="Tell us more about your move... (special items, stairs, parking, etc.)"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 resize-none"
                    {...form.register("details")}
                  />
                </div>

                {/* Promo Code */}
                <div>
                  <Label htmlFor="promoCode" className="text-slate-300 text-sm mb-1.5 block">Promo Code (optional)</Label>
                  <Input
                    id="promoCode"
                    placeholder="Enter promo code for savings"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                    {...form.register("promoCode")}
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <Label htmlFor="photoUpload" className="text-slate-300 text-sm mb-1.5 block">Add Photos (optional)</Label>
                  <p className="text-slate-500 text-xs mb-2">Select up to 5 photos to help us provide an accurate quote.</p>
                  <label
                    htmlFor="photoUpload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500/50 transition-colors cursor-pointer"
                  >
                    {photoFiles && photoFiles.length > 0 ? (
                      <p className="text-slate-300 text-sm">{photoFiles.length} photo{photoFiles.length !== 1 ? "s" : ""} selected</p>
                    ) : (
                      <p className="text-slate-400 text-sm">Tap to add photos</p>
                    )}
                    <input
                      id="photoUpload"
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => setPhotoFiles(e.target.files)}
                    />
                  </label>
                </div>

                {/* SMS Consent */}
                <div className="flex items-start space-x-3 p-4 bg-slate-700/30 rounded-xl border border-slate-600/50">
                  <Checkbox
                    id="smsConsent"
                    checked={form.watch("smsConsent") ?? false}
                    onCheckedChange={(checked) => form.setValue("smsConsent", checked === true)}
                  />
                  <div className="grid gap-1 leading-none">
                    <Label htmlFor="smsConsent" className="text-slate-200 text-sm font-medium cursor-pointer">
                      I agree to receive text messages
                    </Label>
                    <p className="text-xs text-slate-500">
                      By checking this box, you consent to receive SMS notifications about your quote and service updates from JC ON THE MOVE. Message and data rates may apply. Reply STOP to unsubscribe.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-base rounded-xl"
                  disabled={submitLead.isPending}
                >
                  <Send className="mr-2 h-5 w-5" />
                  {submitLead.isPending ? "Submitting..." : "Start My Move"}
                </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── REWARDS CALLOUT ── */}
      <section className="py-8 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-2">Earn JCMOVES Rewards</p>
          <p className="text-slate-300 text-sm mb-4">Earn points on every job and redeem for future services.</p>
          <div className="flex justify-center">
            <Link href="/nature-made-jewls">
              <div className="inline-flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-full px-5 py-2.5 cursor-pointer hover:border-blue-500/50 hover:bg-slate-700/60 transition-all">
                <Gift className="h-4 w-4 text-blue-400" />
                <span className="text-white text-sm font-medium">Nature Made Jewls</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 border-t border-slate-800/60 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">

            {/* Company info */}
            <div>
              <h3 className="text-white font-bold text-base mb-3">JC ON THE MOVE LLC</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Local moving, junk removal, and labor support built for Northwoods homes and businesses.
              </p>
            </div>

            {/* Start Here */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Start Here</h4>
              <ul className="space-y-2">
                {[
                  { label: "Free quote", href: "/quote" },
                  { label: "Junk removal", href: "/quote?service=junk" },
                  { label: "Snow service", href: "/quote?service=snow" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}>
                      <span className="text-slate-400 hover:text-white text-sm transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2">
                {[
                  { label: "Leave a review", href: "/reviews" },
                  { label: "Terms of service", href: "/terms" },
                  { label: "Privacy policy", href: "/privacy" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}>
                      <span className="text-slate-400 hover:text-white text-sm transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Contact</h4>
              <ul className="space-y-2">
                <li>
                  <a href="tel:+19063859312" className="text-slate-400 hover:text-white text-sm transition-colors">
                    (906) 385-9312
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 text-sm">Ironwood and Iron River, MI</span>
                </li>
                <li>
                  <span className="text-slate-400 text-sm">Green Bay and Wausau, WI</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-6 text-center">
            <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} JC ON THE MOVE LLC. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
