import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { SiGoogle } from "react-icons/si";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Gift,
  Images,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Sparkles,
  SprayCan,
  Star,
  Trash2,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatIntakeOverlay from "@/components/ChatIntakeOverlay";
import heroImage from "@assets/IMG_20220818_061221927_HDR_1758501643284.jpg";
import ctaImage from "@assets/IMG_20220919_093840705_HDR_1758501643298.jpg";
import junkImage from "@assets/FB_IMG_1690476073966_1764946176032.jpg";
import badgeImage from "@assets/FB_IMG_1675268829327_1758501643307.jpg";
import haulImage from "@assets/IMG_20220810_125649554_HDR_1758501643329.jpg";
import crewImage from "@assets/FB_IMG_1690476036804_1764946176026.jpg";
import handymanImage from "@assets/stock_images/professional_moving__5a83198e.jpg";
import windowImage from "@assets/stock_images/professional_moving__96dea4c1.jpg";

interface Testimonial {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  serviceType: string | null;
  sourcePlatform: string | null;
  featured: boolean;
}

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  { id: "f1", reviewerName: "Sarah M.", rating: 5, content: "JC and his crew were amazing. Fast, professional, and careful with our home.", serviceType: "Moving", sourcePlatform: "google", featured: true },
  { id: "f2", reviewerName: "Tom R.", rating: 5, content: "Best junk removal service we've used. Fair pricing and super friendly.", serviceType: "Junk Removal", sourcePlatform: null, featured: true },
  { id: "f3", reviewerName: "Ashley K.", rating: 5, content: "They showed up on time, worked hard, and got the job done right.", serviceType: "Moving", sourcePlatform: null, featured: true },
];

const HERO_IMAGE = heroImage;
const CTA_IMAGE = ctaImage;

const VISUAL_SERVICES = [
  {
    label: "Moving",
    sub: "Home, apartment, office",
    href: "/book?service=moving",
    image: heroImage,
    icon: Truck,
    color: "blue",
  },
  {
    label: "Junk Removal",
    sub: "Cleanouts, hauling, disposal",
    href: "/book?service=junk",
    image: junkImage,
    icon: Trash2,
    color: "orange",
  },
  {
    label: "Handyman",
    sub: "Repairs, assembly, odd jobs",
    href: "/book?service=handyman",
    image: handymanImage,
    icon: Wrench,
    color: "emerald",
  },
  {
    label: "Window Cleaning",
    sub: "Streak-free shine",
    href: "/book?service=window",
    image: windowImage,
    icon: SprayCan,
    color: "violet",
  },
];

const MORE_SERVICES = [
  { label: "Cleaning", href: "/book?service=cleaning" },
  { label: "Snow", href: "/book?service=snow" },
  { label: "Lawn", href: "/book/lawn-care" },
  { label: "Demolition", href: "/book?service=demolition" },
  { label: "Roofing", href: "/book?service=roofing" },
  { label: "Painting", href: "/book?service=painting" },
];

const JOB_PHOTOS = [
  { label: "Moving Truck", image: heroImage },
  { label: "Job Ready", image: badgeImage },
  { label: "Northwoods Haul", image: haulImage },
  { label: "Crew Work", image: crewImage },
];

const TRUST_ITEMS = [
  { icon: Shield, label: "Licensed & insured" },
  { icon: Star, label: "5-star rated" },
  { icon: Zap, label: "Fast response" },
  { icon: MapPin, label: "Local crew" },
];

const COLOR_CLASSES: Record<string, { border: string; bg: string; text: string }> = {
  blue: { border: "border-blue-500/70", bg: "bg-blue-600", text: "text-blue-300" },
  orange: { border: "border-orange-500/70", bg: "bg-orange-500", text: "text-orange-300" },
  emerald: { border: "border-emerald-500/70", bg: "bg-emerald-600", text: "text-emerald-300" },
  violet: { border: "border-violet-500/70", bg: "bg-violet-600", text: "text-violet-300" },
};

function startOfDayMessage() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning move slots open";
  if (hour < 17) return "Same-day quotes open";
  return "Tomorrow's schedule open";
}

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeedChip, setChatSeedChip] = useState<string | undefined>(undefined);
  const [showMoreServices, setShowMoreServices] = useState(false);
  const [availabilityLine, setAvailabilityLine] = useState(startOfDayMessage());

  const { data: liveTestimonials } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials?status=published&featured=true&limit=3"],
    staleTime: 5 * 60 * 1000,
  });

  const displayTestimonials = liveTestimonials?.length
    ? liveTestimonials.slice(0, 3)
    : FALLBACK_TESTIMONIALS;

  useEffect(() => {
    const id = window.setInterval(() => setAvailabilityLine(startOfDayMessage()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function openChat(chip?: string) {
    setChatSeedChip(chip);
    setChatOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#020915] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#020915]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <button onClick={() => setLocation("/")} className="text-left">
            <p className="text-xl font-black leading-none tracking-tight">JC ON THE MOVE</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Northwoods moving & more</p>
          </button>
          <div className="hidden items-center gap-8 text-sm font-semibold text-slate-200 md:flex">
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#jobs" className="hover:text-white">Jobs</a>
            <a href="#reviews" className="hover:text-white">Reviews</a>
            <a href="#rewards" className="hover:text-white">Rewards</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="tel:+19062859312" className="hidden items-center gap-2 text-sm font-bold text-white sm:flex">
              <Phone className="h-4 w-4 text-blue-300" />
              (906) 285-9312
            </a>
            <Button onClick={() => openChat("Moving")} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-black hover:bg-blue-500 sm:px-5">
              <span className="sm:hidden">Price</span>
              <span className="hidden sm:inline">Get My Price</span>
            </Button>
          </div>
        </div>
      </nav>

      <section
        className="relative isolate min-h-[640px] overflow-hidden border-b border-white/10 bg-cover bg-center md:min-h-[720px]"
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#020915] via-[#020915]/78 to-[#020915]/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020915] via-transparent to-black/30" />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1fr_320px] md:items-center md:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-black uppercase tracking-[0.28em] text-blue-300">Local movers. Northwoods strong.</p>
            <h1 className="text-[clamp(2.45rem,10.5vw,5.8rem)] font-black leading-[0.94] tracking-tight md:text-8xl">
              WE MOVE<br />
              THE <span className="text-blue-500">NORTHWOODS.</span>
            </h1>
            <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-base font-bold text-white md:text-lg">
              <span>Fast service</span>
              <span className="text-blue-300">Fair prices</span>
              <span>Done right</span>
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => openChat("Moving")} className="h-14 rounded-lg bg-blue-600 px-8 text-base font-black hover:bg-blue-500">
                Get My Price <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <a href="sms:+19062859312">
                <Button variant="outline" className="h-14 rounded-lg border-white/40 bg-black/30 px-8 text-base font-black text-white hover:bg-white/10">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Text Us Now
                </Button>
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
              <p className="text-lg font-black uppercase text-emerald-300">Available Now</p>
            </div>
            <p className="mb-4 text-sm font-semibold text-white">{availabilityLine}</p>
            <div className="space-y-3 text-sm text-slate-200">
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-300" /> Fast quotes</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-300" /> Local crew</p>
              <p className="flex items-center gap-2"><Gift className="h-4 w-4 text-yellow-300" /> Earn JCMOVES rewards</p>
            </div>
            <Button onClick={() => openChat("Moving")} className="mt-6 h-12 w-full rounded-lg bg-emerald-600 font-black hover:bg-emerald-500">
              Book Now
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-slate-950/80">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-3 gap-y-4 px-4 py-5 md:grid-cols-4">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center justify-start gap-2 text-[11px] font-black uppercase tracking-tight text-slate-200 sm:justify-center sm:gap-3 sm:text-sm sm:tracking-wide">
              <Icon className="h-6 w-6 shrink-0 text-blue-300 sm:h-7 sm:w-7" />
              <span className="min-w-0 leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center justify-center gap-5">
            <span className="h-px w-16 bg-white/20" />
            <p className="text-sm font-black uppercase tracking-[0.25em]">Our Services</p>
            <span className="h-px w-16 bg-white/20" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {VISUAL_SERVICES.map((service) => {
              const color = COLOR_CLASSES[service.color];
              const Icon = service.icon;
              return (
                <button
                  key={service.label}
                  onClick={() => setLocation(service.href)}
                  className={`group relative min-h-[210px] overflow-hidden rounded-lg border ${color.border} bg-slate-900 text-left shadow-xl transition-transform hover:-translate-y-1`}
                >
                  <img src={service.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${color.bg} shadow-lg`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <p className="text-xl font-black uppercase">{service.label}</p>
                    <p className="mt-1 text-sm font-medium text-slate-200">{service.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 text-center">
            <button
              onClick={() => setShowMoreServices((prev) => !prev)}
              className="rounded-lg border border-white/25 px-10 py-2 text-sm font-black uppercase tracking-widest text-slate-200 hover:bg-white/10"
            >
              {showMoreServices ? "Hide Services" : "+ More Services"}
            </button>
          </div>
          {showMoreServices && (
            <div className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
              {MORE_SERVICES.map((service) => (
                <button
                  key={service.label}
                  onClick={() => setLocation(service.href)}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 hover:border-blue-400/60 hover:bg-blue-500/10"
                >
                  {service.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="jobs" className="border-y border-white/10 bg-slate-950/70 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center justify-center gap-5">
            <span className="h-px w-16 bg-white/20" />
            <p className="text-sm font-black uppercase tracking-[0.25em]">Real Northwoods Jobs</p>
            <span className="h-px w-16 bg-white/20" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {JOB_PHOTOS.map((photo) => (
              <div key={photo.label} className="relative h-40 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                <img src={photo.image} alt={photo.label} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <span className="absolute bottom-3 left-3 rounded bg-black/80 px-3 py-1 text-xs font-black uppercase tracking-wider">
                  {photo.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center">
            <Link href="/gallery">
              <span className="inline-flex items-center rounded-lg border border-white/25 px-8 py-2 text-sm font-black uppercase tracking-widest text-slate-200 hover:bg-white/10">
                <Images className="mr-2 h-4 w-4" /> View More Jobs
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section id="reviews" className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center justify-center gap-5">
            <span className="h-px w-16 bg-white/20" />
            <p className="text-sm font-black uppercase tracking-[0.25em]">5-Star Northwoods Service</p>
            <span className="h-px w-16 bg-white/20" />
          </div>
          <div className="grid gap-4 md:grid-cols-[210px_1fr_1fr_1fr]">
            <div className="rounded-lg border border-white/10 bg-slate-900/80 p-5 text-center">
              <SiGoogle className="mx-auto mb-2 h-9 w-9 text-blue-300" />
              <p className="text-xl font-black">Google</p>
              <div className="my-2 flex justify-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">5.0 Rating</p>
            </div>
            {displayTestimonials.map((review) => (
              <div key={review.id} className="rounded-lg border border-white/10 bg-slate-900/80 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-black">{review.reviewerName}</p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: Math.max(1, review.rating) }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-200">{review.content}</p>
                {review.serviceType && <p className="mt-4 text-xs font-bold text-slate-500">{review.serviceType}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="rewards" className="border-y border-white/10 bg-slate-950/70 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-300">Book Moves. Earn Rewards.</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">JCMOVES makes every job count.</h2>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-4">
            {[
              { icon: CalendarCheck, title: "Book Service", text: "Schedule any service with JC On The Move." },
              { icon: Star, title: "Earn JCMOVES", text: "Points land with every completed booking." },
              { icon: Gift, title: "Redeem Rewards", text: "Use points for discounts and extras." },
            ].map(({ icon: Icon, title, text }, idx) => (
              <div key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-black">{idx + 1}</span>
                </div>
                <p className="font-black uppercase">{title}</p>
                <p className="mt-2 text-sm text-slate-300">{text}</p>
              </div>
            ))}
            <div className="rounded-lg border border-blue-400/30 bg-blue-600/10 p-5">
              <p className="text-sm font-black uppercase tracking-widest text-blue-200">Ready to earn?</p>
              <p className="mt-3 text-sm text-slate-300">Create your free account and start earning today.</p>
              <Link href="/rewards">
                <Button className="mt-5 w-full rounded-lg bg-blue-600 font-black hover:bg-blue-500">Join JCMOVES</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-4 py-10">
        <img src={CTA_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-[#020915]/80" />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-3xl font-black tracking-tight">LET'S GET YOUR MOVE DONE.</p>
            <p className="mt-2 text-slate-300">Fast. Friendly. Northwoods strong.</p>
          </div>
          <Button onClick={() => openChat("Moving")} className="h-14 rounded-lg bg-blue-600 px-10 text-base font-black hover:bg-blue-500">
            Get My Price <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950 px-4 py-10">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <p className="text-4xl font-black leading-none">JC</p>
            <p className="mt-1 text-lg font-black">ON THE MOVE</p>
            <p className="mt-3 max-w-xs text-sm text-slate-400">Northwoods moving, junk removal, handyman help, and local service work.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-widest">Services</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Moving</p>
              <p>Junk Removal</p>
              <p>Handyman</p>
              <p>Window Cleaning</p>
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-widest">Service Area</p>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Ironwood, MI</p>
              <p>Hurley, WI</p>
              <p>Wakefield, MI</p>
              <p>Bessemer, MI</p>
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-widest">Contact</p>
            <div className="space-y-2 text-sm text-slate-400">
              <a href="tel:+19062859312" className="block hover:text-white">(906) 285-9312</a>
              <p>Ironwood, Michigan</p>
              <p className="flex items-center gap-2 text-slate-200"><Shield className="h-4 w-4 text-blue-300" /> Licensed & insured</p>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-white/10 pt-5 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} JC On The Move. All rights reserved.
        </p>
      </footer>

      <ChatIntakeOverlay
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialChip={chatSeedChip}
      />
    </div>
  );
}
