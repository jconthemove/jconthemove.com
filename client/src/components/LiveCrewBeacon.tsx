import { useState, useEffect } from "react";
import { Circle } from "lucide-react";

export default function LiveCrewBeacon() {
  const [crewCount, setCrewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchCrew() {
      try {
        const res = await fetch("/api/crew/online");
        if (res.ok) {
          const data = await res.json();
          if (active) setCrewCount(typeof data?.count === "number" ? data.count : null);
        }
      } catch {
        if (active) setCrewCount(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchCrew();
    const interval = setInterval(fetchCrew, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const count = crewCount ?? 3;

  return (
    <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-emerald-400 text-sm font-semibold">
        {loading ? "Checking crew..." : `${count} Mover${count !== 1 ? "s" : ""} Online`}
      </span>
      <span className="text-zinc-500 text-xs">· Available now</span>
    </div>
  );
}
