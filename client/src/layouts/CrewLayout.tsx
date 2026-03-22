import { useLocation } from "wouter";
import { CalendarDays, Briefcase, Calendar, Coins } from "lucide-react";

const tabs = [
  { label: "Today", icon: CalendarDays, path: "/crew" },
  { label: "Jobs", icon: Briefcase, path: "/crew/jobs" },
  { label: "Schedule", icon: Calendar, path: "/crew/schedule" },
  { label: "Earnings", icon: Coins, path: "/crew/earnings" },
];

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white pb-20">
      {children}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 safe-area-bottom">
        <div className="flex items-stretch justify-around h-16">
          {tabs.map(({ label, icon: Icon, path }) => {
            const isActive = path === "/crew" ? (location === "/crew" || location === "/crew/") : location.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                aria-label={label}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                  isActive ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
