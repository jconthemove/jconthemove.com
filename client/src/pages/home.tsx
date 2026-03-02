import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Trash2, Snowflake, Sparkles, Gift, ShoppingBag, Star, Users, Volume2, VolumeX, Gem, Clock, BadgeDollarSign, CheckCircle2 } from "lucide-react";
import promoImage from "@assets/file_00000000839871fd8e13378301744f2e_(1)_1771260918919.png";
import { Link } from "wouter";

const jewelryVideoSrc = "/jewelry-video.mp4";

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hasPlayed = false;

    const playVideo = async () => {
      if (hasPlayed) return;
      try {
        await video.play();
        hasPlayed = true;
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('touchstart', handleUserInteraction);
      } catch (error) {
        console.log("Video play attempt failed, will retry on interaction or when ready");
      }
    };

    const handleCanPlay = () => {
      playVideo();
    };

    const handleUserInteraction = () => {
      playVideo();
    };

    video.addEventListener('canplay', handleCanPlay);
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    playVideo();

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">

      {/* Nature Made Jewls — Top Dedication Banner */}
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

      {/* Hero Section with Branding and Video */}
      <section className="py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Company Branding */}
          <h1 className="text-3xl md:text-5xl font-bold text-center text-white mb-6 tracking-wide">
            JC ON THE MOVE LLC
          </h1>
          
          {/* Centered Video - Compact Size */}
          <div className="relative mx-auto max-w-xl">
            <div className="relative aspect-[4/5] md:aspect-[16/9] overflow-hidden rounded-2xl shadow-2xl border-4 border-primary/30">
              <video
                ref={videoRef}
                src="/attached_assets/hero-video-compressed.mp4"
                poster="/attached_assets/FB_IMG_5937718007297288444_1758496258755.jpg"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-cover"
                data-testid="video-hero"
              >
                Your browser does not support the video tag.
              </video>
              
              {/* Unmute Button */}
              <button
                onClick={toggleMute}
                className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-all duration-200 backdrop-blur-sm shadow-lg hover:scale-110 z-10"
                aria-label={isMuted ? "Unmute video" : "Mute video"}
                data-testid="button-toggle-mute"
              >
                {isMuted ? (
                  <VolumeX className="h-6 w-6" />
                ) : (
                  <Volume2 className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Monthly Special Promo - #1 Slot */}
      <section className="py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/promo/half-day">
            <div className="relative group cursor-pointer rounded-2xl overflow-hidden shadow-2xl border-2 border-yellow-400/60 hover:border-yellow-300 transition-all duration-300 hover:scale-[1.01]">
              <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-500 text-black text-center py-2 font-extrabold text-sm md:text-base tracking-wider uppercase">
                <span className="animate-pulse">&#9733;</span> Monthly Special — Best Value <span className="animate-pulse">&#9733;</span>
              </div>
              <img
                src={promoImage}
                alt="Half Day Loading/Unloading - 3 movers, 4 hours, travel time included - $600"
                className="w-full object-cover max-h-[420px] md:max-h-[480px]"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-400 font-bold text-lg md:text-xl">Half Day Loading/Unloading</p>
                    <p className="text-white/80 text-sm">3 Movers &bull; 4 Hours &bull; Travel Included</p>
                  </div>
                  <div className="bg-yellow-500 text-black font-extrabold text-xl md:text-2xl px-4 py-2 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                    $600
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* NEED HELP? Section */}
      <section className="py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-8">
            NEED HELP?
          </h2>
          
          {/* 4 Service Boxes - 2x2 Grid */}
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {/* Moving */}
            <Link href="/quote?service=residential">
              <Card className="group cursor-pointer bg-gradient-to-br from-blue-600 to-blue-800 border-2 border-blue-400/50 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-[1.02]" data-testid="card-moving">
                <CardContent className="p-6 md:p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="bg-white/20 p-4 rounded-full">
                      <Truck className="h-10 w-10 md:h-14 md:w-14 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">MOVING</h3>
                  <p className="text-blue-100 text-sm md:text-base">Loading & Unloading</p>
                </CardContent>
              </Card>
            </Link>

            {/* Junk Removal */}
            <Link href="/quote?service=junk">
              <Card className="group cursor-pointer bg-gradient-to-br from-orange-600 to-orange-800 border-2 border-orange-400/50 hover:border-orange-300 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300 hover:scale-[1.02]" data-testid="card-junk">
                <CardContent className="p-6 md:p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="bg-white/20 p-4 rounded-full">
                      <Trash2 className="h-10 w-10 md:h-14 md:w-14 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">JUNK</h3>
                  <p className="text-orange-100 text-sm md:text-base">Removal</p>
                </CardContent>
              </Card>
            </Link>

            {/* Snow Removal */}
            <Link href="/quote?service=snow">
              <Card className="group cursor-pointer bg-gradient-to-br from-cyan-600 to-cyan-800 border-2 border-cyan-400/50 hover:border-cyan-300 hover:shadow-xl hover:shadow-cyan-500/20 transition-all duration-300 hover:scale-[1.02]" data-testid="card-snow">
                <CardContent className="p-6 md:p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="bg-white/20 p-4 rounded-full">
                      <Snowflake className="h-10 w-10 md:h-14 md:w-14 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">SNOW</h3>
                  <p className="text-cyan-100 text-sm md:text-base">Removal</p>
                </CardContent>
              </Card>
            </Link>

            {/* Move In/Out Cleaning */}
            <Link href="/quote?service=cleaning">
              <Card className="group cursor-pointer bg-gradient-to-br from-green-600 to-green-800 border-2 border-green-400/50 hover:border-green-300 hover:shadow-xl hover:shadow-green-500/20 transition-all duration-300 hover:scale-[1.02]" data-testid="card-cleaning">
                <CardContent className="p-6 md:p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="bg-white/20 p-4 rounded-full">
                      <Sparkles className="h-10 w-10 md:h-14 md:w-14 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">MOVE IN/OUT</h3>
                  <p className="text-green-100 text-sm md:text-base">Cleaning</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Estimator CTA */}
          <Link href="/moving-estimator">
            <div className="mt-5 group flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-teal-500/50 bg-gradient-to-r from-teal-900/40 to-blue-900/40 hover:border-teal-400 hover:from-teal-900/60 hover:to-blue-900/60 transition-all duration-300 cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="bg-teal-500/20 p-2.5 rounded-xl">
                  <Truck className="h-6 w-6 text-teal-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-base">Not sure what you need?</p>
                  <p className="text-teal-300 text-sm">Get an instant moving estimate →</p>
                </div>
              </div>
              <div className="bg-teal-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg group-hover:bg-teal-400 transition-colors">
                Estimate
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Nature Made Jewls - Featured Business Card Style */}
      <section className="py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/nature-made-jewls">
            <div className="group cursor-pointer relative overflow-hidden rounded-2xl shadow-2xl border-2 border-amber-700/50 hover:border-amber-400/80 hover:shadow-amber-800/40 transition-all duration-500 hover:scale-[1.01]"
              style={{ background: "linear-gradient(135deg, #1a0e08 0%, #2d1a0f 30%, #1e1208 60%, #120a05 100%)" }}>
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(139,90,43,0.15) 2px, rgba(139,90,43,0.15) 4px)" }} />
              <div className="relative flex items-center gap-0 overflow-hidden">
                <div className="flex-shrink-0 w-32 md:w-48 h-28 md:h-36 overflow-hidden">
                  <video
                    src={jewelryVideoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-y-0 left-32 md:left-48 w-8 bg-gradient-to-r from-[#1a0e08] to-transparent" />
                </div>
                <div className="flex-1 px-4 md:px-6 py-4">
                  <p className="text-amber-500/70 text-[10px] uppercase tracking-widest mb-1 font-medium">Handmade Jewelry &amp; Custom Creations</p>
                  <h3 className="font-serif text-xl md:text-2xl font-bold text-amber-100 tracking-wide mb-2"
                    style={{ fontFamily: "'Georgia', serif" }}>
                    Nature Made Jewls
                  </h3>
                  <div className="space-y-1 mb-3">
                    {["Copper Wire Jewelry", "Natural Stone Pieces", "Custom Designs"].map(f => (
                      <div key={f} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        <span className="text-amber-100/80 text-xs">{f}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
                    <span>Shop Collection</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
                <div className="hidden md:block flex-shrink-0 pr-5 text-right">
                  <p className="text-amber-100/50 text-[10px] mb-1">Visit</p>
                  <p className="text-amber-300/70 text-xs font-semibold">www.JCONTHEMOVE.com</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Bottom Row - Reviews, Rewards, Shop, Sponsors */}
      <section className="py-8 px-4 pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-4 gap-2 md:gap-4">
            {/* Reviews */}
            <Link href="/reviews">
              <Card className="group cursor-pointer bg-gradient-to-br from-yellow-600 to-yellow-800 border border-yellow-500/30 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300" data-testid="card-reviews">
                <CardContent className="p-3 md:p-4 text-center">
                  <div className="mb-2 flex justify-center">
                    <Star className="h-6 w-6 md:h-8 md:w-8 text-yellow-200" />
                  </div>
                  <h3 className="text-xs md:text-sm font-semibold text-white">Reviews</h3>
                </CardContent>
              </Card>
            </Link>

            {/* Rewards */}
            <Link href="/employee-login">
              <Card className="group cursor-pointer bg-gradient-to-br from-purple-700 to-purple-900 border border-purple-500/30 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300" data-testid="card-rewards">
                <CardContent className="p-3 md:p-4 text-center">
                  <div className="mb-2 flex justify-center">
                    <Gift className="h-6 w-6 md:h-8 md:w-8 text-purple-200" />
                  </div>
                  <h3 className="text-xs md:text-sm font-semibold text-white">Rewards</h3>
                </CardContent>
              </Card>
            </Link>

            {/* Shop */}
            <a href="https://shop.jconthemove.com" target="_blank" rel="noopener noreferrer">
              <Card className="group cursor-pointer bg-gradient-to-br from-pink-700 to-pink-900 border border-pink-500/30 hover:border-pink-400 hover:shadow-lg hover:shadow-pink-500/20 transition-all duration-300" data-testid="card-shop">
                <CardContent className="p-3 md:p-4 text-center">
                  <div className="mb-2 flex justify-center">
                    <ShoppingBag className="h-6 w-6 md:h-8 md:w-8 text-pink-200" />
                  </div>
                  <h3 className="text-xs md:text-sm font-semibold text-white">Shop</h3>
                </CardContent>
              </Card>
            </a>

            {/* Sponsors */}
            <Link href="/sponsors">
              <Card className="group cursor-pointer bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-500/30 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-500/20 transition-all duration-300" data-testid="card-sponsors">
                <CardContent className="p-3 md:p-4 text-center">
                  <div className="mb-2 flex justify-center">
                    <Users className="h-6 w-6 md:h-8 md:w-8 text-slate-200" />
                  </div>
                  <h3 className="text-xs md:text-sm font-semibold text-white">Sponsors</h3>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
