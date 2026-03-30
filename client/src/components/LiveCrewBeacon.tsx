import { useCrewStatus } from "@/hooks/useCrewStatus";

export default function LiveCrewBeacon() {
  const { data, isLoading } = useCrewStatus(5000);

  const count = data?.count ?? 0;
  const tierEmoji = data?.tierEmoji ?? "⏳";
  const tierLabel = data?.tierLabel ?? "Limited";
  const tier = data?.tier ?? "limited";

  const tierColors = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    limited: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  };

  const dotColors = {
    high: "bg-emerald-400",
    medium: "bg-yellow-400",
    limited: "bg-orange-400",
  };

  const pingColors = {
    high: "bg-emerald-400",
    medium: "bg-yellow-400",
    limited: "bg-orange-400",
  };

  return (
    <div className={`flex items-center justify-between gap-2 py-2.5 px-4 border rounded-2xl ${tierColors[tier]}`}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColors[tier]} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColors[tier]}`} />
        </span>
        <span className="text-sm font-bold">
          JC ON THE MOVE Crew
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {isLoading ? (
          <span className="text-xs opacity-60">Checking…</span>
        ) : (
          <>
            <span className="text-sm font-semibold">
              {count} Mover{count !== 1 ? "s" : ""} Available
            </span>
            <span className="text-xs opacity-70">· {tierEmoji} {tierLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
