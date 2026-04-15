import { type LucideIcon, CheckCircle2, ShieldCheck, ChevronRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlacardStat {
  icon: LucideIcon;
  value: string;
  label: string;
}

export interface PlacardHowItWorksStep {
  step: string;
  label: string;
}

export interface PlacardCta {
  label: string;
  onClick: () => void;
  phoneNumber?: string;
  colorClass?: string;
  hoverClass?: string;
}

export interface ServicePlacardTheme {
  gradient: string;
  boxShadowBorder: string;
  accentColor: string;
  subheadlineHex: string;
  subheadlineGlowRgba: string;
  featuresBorderColor: string;
  statsBorderColor: string;
  featureIcon?: "check" | "shield";
  howItWorksBg?: string;
  howItWorksBorder?: string;
}

export interface ServicePlacardProps {
  theme: ServicePlacardTheme;
  tagline: string;
  headline: string;
  subheadline: string;
  bodyText: string;
  featuresLabel: string;
  features: string[];
  stats: PlacardStat[];
  howItWorks?: PlacardHowItWorksStep[];
  cta?: PlacardCta;
}

const THEMES: Record<string, ServicePlacardTheme> = {
  cleaning: {
    gradient: "linear-gradient(160deg, #170c2e 0%, #240d3a 35%, #130924 65%, #0a0514 100%)",
    boxShadowBorder: "rgba(168,85,247,0.2)",
    accentColor: "text-purple-400",
    subheadlineHex: "#c084fc",
    subheadlineGlowRgba: "rgba(192,132,252,0.4)",
    featuresBorderColor: "rgba(168,85,247,0.2)",
    statsBorderColor: "rgba(168,85,247,0.15)",
    howItWorksBg: "rgba(168,85,247,0.06)",
    howItWorksBorder: "rgba(168,85,247,0.2)",
  },
  roofing: {
    gradient: "linear-gradient(160deg, #1c1a16 0%, #2e2a20 35%, #1a1710 65%, #0d0b08 100%)",
    boxShadowBorder: "rgba(120,113,108,0.25)",
    accentColor: "text-stone-400",
    subheadlineHex: "#a8a29e",
    subheadlineGlowRgba: "rgba(168,162,158,0.3)",
    featuresBorderColor: "rgba(120,113,108,0.25)",
    statsBorderColor: "rgba(120,113,108,0.15)",
    featureIcon: "shield",
    howItWorksBg: "rgba(120,113,108,0.06)",
    howItWorksBorder: "rgba(120,113,108,0.2)",
  },
  demolition: {
    gradient: "linear-gradient(160deg, #1c0a0a 0%, #2e1010 35%, #1a0808 65%, #0d0404 100%)",
    boxShadowBorder: "rgba(239,68,68,0.18)",
    accentColor: "text-red-400",
    subheadlineHex: "#f87171",
    subheadlineGlowRgba: "rgba(248,113,113,0.4)",
    featuresBorderColor: "rgba(239,68,68,0.2)",
    statsBorderColor: "rgba(239,68,68,0.15)",
    howItWorksBg: "rgba(239,68,68,0.06)",
    howItWorksBorder: "rgba(239,68,68,0.2)",
  },
  lawn: {
    gradient: "linear-gradient(160deg, #071c0a 0%, #0d2e12 35%, #071808 65%, #030d04 100%)",
    boxShadowBorder: "rgba(34,197,94,0.18)",
    accentColor: "text-green-400",
    subheadlineHex: "#4ade80",
    subheadlineGlowRgba: "rgba(74,222,128,0.4)",
    featuresBorderColor: "rgba(34,197,94,0.2)",
    statsBorderColor: "rgba(34,197,94,0.15)",
    howItWorksBg: "rgba(34,197,94,0.06)",
    howItWorksBorder: "rgba(34,197,94,0.2)",
  },
};

export function getPlacardTheme(key: string): ServicePlacardTheme {
  return THEMES[key] ?? THEMES.cleaning;
}

export default function ServicePlacard({
  theme,
  tagline,
  headline,
  subheadline,
  bodyText,
  featuresLabel,
  features,
  stats,
  howItWorks,
  cta,
}: ServicePlacardProps) {
  const FeatureIcon = theme.featureIcon === "shield" ? ShieldCheck : CheckCircle2;

  return (
    <div
      className="relative rounded-3xl overflow-hidden"
      style={{
        background: theme.gradient,
        boxShadow: `0 0 0 1.5px ${theme.boxShadowBorder}, 0 8px 40px rgba(0,0,0,0.7)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)`,
        }}
      />
      <div className="relative z-10 px-5 pt-6 pb-5 space-y-4">

        <div className="text-center space-y-1">
          <p className={cn("text-xs font-bold uppercase tracking-[0.25em]", theme.accentColor)}>{tagline}</p>
          <h1
            className="text-4xl font-black leading-none tracking-tight text-white"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}
          >
            {headline}
          </h1>
          <h1
            className="text-4xl font-black leading-none tracking-tight"
            style={{ color: theme.subheadlineHex, textShadow: `0 2px 16px ${theme.subheadlineGlowRgba}` }}
          >
            {subheadline}
          </h1>
          <p className="text-zinc-300 text-sm font-medium mt-2">{bodyText}</p>
        </div>

        <div
          className="rounded-2xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${theme.featuresBorderColor}` }}
        >
          <p className={cn("text-[10px] font-black uppercase tracking-widest mb-2", theme.accentColor)}>
            {featuresLabel}
          </p>
          <div className="grid grid-cols-1 gap-1">
            {features.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <FeatureIcon className={cn("h-3.5 w-3.5 flex-shrink-0", theme.accentColor)} />
                <span className="text-zinc-200 text-xs">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex-1 rounded-xl px-3 py-2 text-center"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.statsBorderColor}` }}
            >
              <stat.icon className={cn("h-4 w-4 mx-auto mb-1", theme.accentColor)} />
              <p className="text-white text-sm font-bold">{stat.value}</p>
              <p className="text-zinc-500 text-[10px]">{stat.label}</p>
            </div>
          ))}
        </div>

        {howItWorks && howItWorks.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{
              background: theme.howItWorksBg ?? "rgba(255,255,255,0.05)",
              border: `1px solid ${theme.howItWorksBorder ?? theme.featuresBorderColor}`,
            }}
          >
            <p className={cn("text-[10px] font-black uppercase tracking-widest mb-2.5", theme.accentColor)}>
              How It Works
            </p>
            <div className="flex items-start gap-1">
              {howItWorks.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center text-center">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mb-1"
                    style={{ background: theme.howItWorksBg ?? "rgba(255,255,255,0.1)", border: `1px solid ${theme.howItWorksBorder ?? theme.featuresBorderColor}` }}
                  >
                    <span className={theme.accentColor}>{s.step}</span>
                  </div>
                  <p className="text-zinc-300 text-[9px] leading-snug">{s.label}</p>
                  {i < howItWorks.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-zinc-600 absolute" style={{ right: `calc(${100 / howItWorks.length}% * ${i + 1} - 6px)`, top: "50%" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {cta && (
          <div className="flex gap-2">
            <button
              onClick={cta.onClick}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-sm text-white transition-colors",
                cta.colorClass ?? "bg-teal-700 hover:bg-teal-600",
                cta.hoverClass,
              )}
            >
              {cta.label}
            </button>
            {cta.phoneNumber && (
              <button
                onClick={() => window.open(`tel:${cta.phoneNumber}`, "_self")}
                className="h-12 px-4 rounded-2xl border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
              >
                <Phone className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
