const COLORS = ["#f97316","#a855f7","#22c55e","#eab308","#3b82f6","#ec4899"];
const PIECES = Array.from({ length: 18 }, (_, i) => i);

const REDUCED_MOTION_STYLE = `@media (prefers-reduced-motion: reduce) {
  .confetti-piece { animation: none !important; opacity: 0 !important; }
}`;

interface ConfettiBurstProps {
  active: boolean;
  variant?: "inline" | "overlay";
}

export function ConfettiBurst({ active, variant = "inline" }: ConfettiBurstProps) {
  if (!active) return null;

  if (variant === "overlay") {
    return (
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-[999]">
        <style>{`
          @keyframes confettiFall{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1;}100%{transform:translateY(140px) rotate(360deg) scale(0.3);opacity:0;}}
          ${REDUCED_MOTION_STYLE}
        `}</style>
        {PIECES.map((i) => {
          const x = 15 + (i / PIECES.length) * 70;
          return (
            <div
              key={i}
              className="confetti-piece absolute w-2.5 h-2.5 rounded-full"
              style={{
                left: `${x}%`,
                top: "35%",
                background: COLORS[i % COLORS.length],
                animation: `confettiFall 0.32s ease-out ${i * 18}ms forwards`,
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-20">
      <style>{`
        @keyframes confettiBurst{0%{opacity:1;}100%{transform:rotate(var(--cb-angle)) translateY(-80px) scale(0.3);opacity:0;}}
        ${REDUCED_MOTION_STYLE}
      `}</style>
      {PIECES.map((i) => {
        const angle = (i / PIECES.length) * 360;
        return (
          <div
            key={i}
            className="confetti-piece absolute w-2 h-2 rounded-full"
            style={{
              left: "50%",
              top: "50%",
              background: COLORS[i % COLORS.length],
              animation: `confettiBurst 0.28s ease-out ${i * 12}ms forwards`,
              "--cb-angle": `${angle}deg`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
