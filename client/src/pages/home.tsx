import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Trash2, Snowflake, Sparkles, Gift, ShoppingBag, Star, Users, Volume2, VolumeX, Gem, Clock, BadgeDollarSign } from "lucide-react";
import promoImage from "@assets/file_00000000839871fd8e13378301744f2e_(1)_1771260918919.png";
import { Link } from "wouter";

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
        </div>
      </section>

      {/* Nature Made Jewls - Featured */}
      <section className="py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/nature-made-jewls">
            <Card className="group cursor-pointer overflow-hidden bg-gradient-to-r from-emerald-800 via-amber-700 to-emerald-800 border-2 border-amber-400/50 hover:border-amber-300 hover:shadow-2xl hover:shadow-amber-500/30 transition-all duration-500 hover:scale-[1.01]">
              <CardContent className="p-6 md:p-8 flex items-center justify-between relative">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvZz48L3N2Zz4=')] opacity-50" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="bg-white/20 p-3 md:p-4 rounded-full backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                    <Gem className="h-8 w-8 md:h-10 md:w-10 text-amber-200" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-serif font-bold text-white tracking-wide">Nature Made Jewls</h3>
                    <p className="text-amber-100/90 text-sm md:text-base">Handcrafted jewelry from Michigan's UP</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 text-amber-200 relative z-10">
                  <span className="text-sm font-medium">Shop Now</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </CardContent>
            </Card>
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
