export type StatusCategory = "lead" | "confirmed" | "completed";

export function getStatusCategory(status: string): StatusCategory {
  if (["completed", "paid"].includes(status)) return "completed";
  if (["confirmed", "accepted", "in_progress", "scheduled"].includes(status)) return "confirmed";
  return "lead";
}

export function getStatusColors(status: string) {
  const cat = getStatusCategory(status);
  switch (cat) {
    case "completed":
      return {
        dot: "bg-green-500",
        glow: "shadow-green-500/70",
        border: "border-l-green-500",
        ring: "ring-green-500/20",
        text: "text-green-400",
        badgeBg: "bg-green-500/15 text-green-300 border border-green-500/30",
        cardBorder: "border-green-500/40 hover:border-green-400/70",
        label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
        category: "completed" as StatusCategory,
      };
    case "confirmed":
      return {
        dot: "bg-yellow-400",
        glow: "shadow-yellow-400/70",
        border: "border-l-yellow-400",
        ring: "ring-yellow-400/20",
        text: "text-yellow-400",
        badgeBg: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
        cardBorder: "border-yellow-500/40 hover:border-yellow-400/70",
        label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
        category: "confirmed" as StatusCategory,
      };
    default:
      return {
        dot: "bg-red-500",
        glow: "shadow-red-500/70",
        border: "border-l-red-500",
        ring: "ring-red-500/20",
        text: "text-red-400",
        badgeBg: "bg-red-500/15 text-red-300 border border-red-500/30",
        cardBorder: "border-red-500/40 hover:border-red-400/70",
        label: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
        category: "lead" as StatusCategory,
      };
  }
}
