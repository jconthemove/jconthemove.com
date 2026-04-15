const COLORS = ["#f97316","#a855f7","#22c55e","#eab308","#3b82f6","#ec4899"];
const PIECES = Array.from({ length: 18 }, (_, i) => i);

interface ConfettiBurstProps {
  active: boolean;
  variant?: "inline" | "overlay";
}

export function ConfettiBurst({ active, variant = "inline" }: ConfettiBurstProps) {
  if (!active) return null;

  if (variant === "overlay") {
    return (
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-[999]">
        <style>{`@keyframes confettiFall{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1;}100%{transform:translateY(140px) rotate(360deg) scale(0.3);opacity:0;}}`}</style>
        {PIECES.map((i) => {
          const x = 15 + (i / PIECES.length) * 70;
          return (
            <div
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full"
              style={{
                left: `${x}%`,
                top: "35%",
                background: COLORS[i % COLORS.length],
                animation: `confettiFall 0.95s ease-out ${i * 35}ms forwards`,
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-20">
      <style>{`@keyframes confettiBurst{0%{opacity:1;}100%{transform:rotate(var(--angle)) translateY(-80px) scale(0.3);opacity:0;}}`}</style>
      {PIECES.map((i) => {
        const angle = (i / PIECES.length) * 360;
        return (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: "50%",
              top: "50%",
              background: COLORS[i % COLORS.length],
              animation: `confettiBurst 0.7s ease-out ${i * 20}ms forwards`,
              "--angle": `${angle}deg`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
