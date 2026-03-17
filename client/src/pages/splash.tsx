import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Truck, ClipboardList, Users, Zap, ChevronRight, MapPin, Star } from "lucide-react";

const features = [
  { icon: ClipboardList, text: "Post moving, hauling & cleanup jobs", delay: 800 },
  { icon: Users, text: "Connect with local trusted crews", delay: 1000 },
  { icon: Zap, text: "Earn JCMOVES rewards every job", delay: 1200 },
];

const LOCATIONS = ["Ironwood", "Hurley", "Ashland", "Bessemer", "Wakefield"];

export default function SplashPage() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 600);
    const t3 = setTimeout(() => setPhase(3), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-between overflow-hidden relative">

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-jc-orange/8 blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-15%] w-[400px] h-[400px] rounded-full bg-orange-500/5 blur-[80px]" style={{ animationDelay: "1s", animationDuration: "4s" }} />
        <div className="absolute top-[30%] right-[-5%] w-[200px] h-[200px] rounded-full bg-amber-500/5 blur-[60px]" style={{ animationDelay: "2s", animationDuration: "5s" }} />
      </div>

      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <div className="w-full max-w-[390px] flex flex-col items-center">

          <div
            className={`relative transition-all duration-1000 ease-out ${
              phase >= 1 ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-50 translate-y-8"
            }`}
          >
            <div className="absolute inset-0 rounded-3xl bg-jc-orange/30 blur-xl scale-125" />
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-jc-orange to-orange-600 flex items-center justify-center shadow-2xl shadow-jc-orange/40">
              <Truck className="h-12 w-12 text-white drop-shadow-lg" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-400 border-2 border-zinc-950 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </div>
          </div>

          <div
            className={`mt-8 text-center transition-all duration-700 ease-out ${
              phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <h1 className="text-[28px] font-black text-white tracking-tight leading-tight">
              JC ON THE MOVE
            </h1>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <div className="h-px w-8 bg-gradient-to-r from-transparent to-jc-orange/60" />
              <span className="text-jc-orange text-xs font-bold tracking-[0.2em] uppercase">LLC</span>
              <div className="h-px w-8 bg-gradient-to-l from-transparent to-jc-orange/60" />
            </div>
            <p className="text-zinc-400 text-sm mt-3 font-medium">
              Northwoods' Most Trusted Local Service
            </p>

            <div className="flex items-center justify-center gap-1 mt-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-zinc-500 text-xs ml-1.5">5.0</span>
            </div>
          </div>

          <div
            className={`w-full mt-10 space-y-3 transition-all duration-700 ease-out ${
              phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {features.map(({ icon: Icon, text, delay }, idx) => (
              <div
                key={text}
                className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-3.5 border border-white/5"
                style={{
                  animation: phase >= 3 ? `slideUp 0.5s ease-out ${(idx * 150)}ms both` : "none"
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-jc-orange/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-jc-orange" />
                </div>
                <span className="text-zinc-300 text-[14px] font-medium leading-snug">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`w-full px-6 pb-10 relative z-10 transition-all duration-700 ease-out ${
          phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
        style={{ transitionDelay: "400ms" }}
      >
        <div className="w-full max-w-[390px] mx-auto">

          <div className="flex items-center justify-center gap-1.5 mb-5">
            <MapPin className="h-3 w-3 text-zinc-600" />
            <div className="flex gap-1.5 flex-wrap justify-center">
              {LOCATIONS.map((loc, i) => (
                <span key={loc} className="text-zinc-600 text-[11px] font-medium">
                  {loc}{i < LOCATIONS.length - 1 ? " ·" : ""}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setLocation("/get-started")}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-jc-orange to-orange-500 text-white font-bold text-base shadow-xl shadow-jc-orange/25 hover:shadow-jc-orange/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
          >
            Get Started
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => setLocation("/login")}
            className="w-full mt-3 py-3 text-zinc-500 text-sm font-medium hover:text-white transition-colors text-center"
          >
            Already have an account? <span className="text-jc-orange">Sign in</span>
          </button>
        </div>
      </div>
    </div>
  );
}
